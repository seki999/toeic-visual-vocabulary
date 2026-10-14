import { describe, it, expect, vi, beforeEach } from "vitest";
import "fake-indexeddb/auto";
import { SpeechPlayer } from "../src/speech";
import { defaults } from "../src/store";
import { asset, language, fieldText, type Word, type List } from "../src/types";
import {
  saveWord,
  loadWords,
  clearDrafts,
  storeImage,
  imageBlob,
  exportDrafts,
  deleteImage,
} from "../src/drafts";
import JSZip from "jszip";
const word: Word = {
  id: "v000001",
  sourceKey: "key",
  word: "abstain",
  partOfSpeech: "v.",
  ipa: { uk: "ipa", us: "ipa" },
  meaning: "戒除",
  collocation: { en: "abstain from alcohol", zh: "戒酒" },
  example: { en: "He abstains.", zh: "他戒酒。" },
  images: [],
  tags: [],
  notes: "",
};
function mock() {
  const spoken: any[] = [];
  const synth = {
    cancel: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    getVoices: () => [
      { voiceURI: "en", lang: "en-US" },
      { voiceURI: "zh", lang: "zh-CN" },
    ],
    speak: (u: any) => spoken.push(u),
  };
  const focus = vi.fn(),
    changed = vi.fn();
  const player = new SpeechPlayer(
    synth as any,
    changed,
    focus,
    vi.fn(),
    () => ({}) as SpeechSynthesisUtterance,
  );
  return { spoken, synth, focus, changed, player };
}
describe("speech state machine", () => {
  beforeEach(() => vi.useFakeTimers());
  it("uses ordered, separate English and Chinese utterances", () => {
    const m = mock();
    m.player.play([word], 0, { ...defaults, order: ["meaning", "word"] });
    expect(m.spoken[0].text).toBe("戒除");
    expect(m.spoken[0].lang).toBe("zh-CN");
    m.spoken[0].onend();
    vi.advanceTimersByTime(500);
    expect(m.spoken[1].text).toBe("abstain");
    expect(m.spoken[1].lang).toBe("en-US");
  });
  it("moves focus once when advancing a word", () => {
    const m = mock();
    m.player.play([word, { ...word, id: "v000002" }], 0, {
      ...defaults,
      order: ["word"],
      gap: 0,
      itemGap: 0,
    });
    m.spoken[0].onend();
    vi.runOnlyPendingTimers();
    vi.runOnlyPendingTimers();
    expect(m.focus.mock.calls).toEqual([[0], [1]]);
  });
  it("pauses, resumes and stops", () => {
    const m = mock();
    m.player.play([word], 0, defaults);
    m.player.pause();
    expect(m.player.status).toBe("paused");
    m.player.resume();
    expect(m.player.status).toBe("playing");
    m.player.stop();
    expect(m.player.status).toBe("stopped");
    expect(m.synth.cancel).toHaveBeenCalled();
  });
  it("ignores callbacks from cancelled generations", () => {
    const m = mock();
    m.player.play([word], 0, defaults);
    const oldEnd = m.spoken[0].onend;
    m.player.play([word], 0, defaults);
    oldEnd();
    vi.runAllTimers();
    expect(m.spoken).toHaveLength(2);
  });
  it("holds a field delay while paused", () => {
    const m = mock();
    m.player.play([word], 0, defaults);
    m.spoken[0].onend();
    m.player.pause();
    vi.advanceTimersByTime(2000);
    expect(m.spoken).toHaveLength(1);
    m.player.resume();
    vi.advanceTimersByTime(500);
    expect(m.spoken).toHaveLength(2);
  });
  it("stop removes utterance callbacks and pending delays", () => {
    const m = mock();
    m.player.play([word], 0, defaults);
    const utterance = m.spoken[0],
      oldEnd = utterance.onend;
    m.player.stop();
    expect(utterance.onend).toBeNull();
    expect(utterance.onerror).toBeNull();
    oldEnd();
    m.player.resume();
    vi.runAllTimers();
    expect(m.player.status).toBe("stopped");
    expect(m.spoken).toHaveLength(1);
    m.player.play([word], 0, defaults);
    expect(m.spoken[1].text).toBe(word.word);
  });
  it("clears the browser paused flag after cancelling the queue", () => {
    const m = mock();
    Object.defineProperty(m.synth, "paused", { value: true });
    m.player.stop();
    expect(m.synth.cancel.mock.invocationCallOrder[0]).toBeLessThan(
      m.synth.resume.mock.invocationCallOrder[0],
    );
    expect(m.player.status).toBe("stopped");
  });
  it("stop cancels a paused field delay", () => {
    const m = mock();
    m.player.play([word], 0, defaults);
    m.spoken[0].onend();
    m.player.pause();
    m.player.stop();
    m.player.resume();
    vi.runAllTimers();
    expect(m.player.status).toBe("stopped");
    expect(m.spoken).toHaveLength(1);
  });
  it("repeats fields and finishes a list", () => {
    const m = mock();
    m.player.play([word], 0, {
      ...defaults,
      order: ["word"],
      fieldRepeat: 2,
      gap: 0,
    });
    m.spoken[0].onend();
    vi.runOnlyPendingTimers();
    m.spoken[1].onend();
    vi.runOnlyPendingTimers();
    expect(m.player.status).toBe("stopped");
  });
});
describe("data paths", () => {
  it("uses repository base paths", () =>
    expect(asset("/images/list01/a.webp", "/repo/")).toBe(
      "/repo/images/list01/a.webp",
    ));
  it("returns content and correct languages", () => {
    expect(fieldText(word, "example.en")).toBe("He abstains.");
    expect(language("example.zh")).toBe("zh-CN");
    expect(language("word")).toBe("en-US");
  });
});
describe("IndexedDB and ZIP", () => {
  beforeEach(async () => {
    vi.useRealTimers();
    await clearDrafts();
  });
  it("persists records across fresh reads", async () => {
    await saveWord({ ...word, notes: "saved" });
    expect((await loadWords())[0].notes).toBe("saved");
  });
  it("associates image files with stable IDs and exports relative paths", async () => {
    const src = "images/list01/v000001-a.webp";
    await storeImage(src, new Uint8Array([1, 2]) as any);
    const changed = {
      ...word,
      images: [
        {
          id: "a",
          src,
          alt: "a",
          widthPercent: 100,
          height: 300,
          objectFit: "contain" as const,
          objectPosition: "center",
          rotation: 0,
          zoom: 1,
        },
      ],
    };
    await saveWord(changed);
    expect(await imageBlob(src)).toBeTruthy();
    const list: List = {
      id: "list01",
      title: "List 01",
      description: "",
      items: [word],
    };
    const blob = await exportDrafts([list]);
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    expect(zip.file("public/" + src)).toBeTruthy();
    const data = JSON.parse(
      await zip.file("public/data/list01.json")!.async("string"),
    );
    expect(data.items[0].images[0].src).toBe(src);
  });
  it("exports deletions", async () => {
    await deleteImage("images/list01/old.webp");
    const zip = await JSZip.loadAsync(
      await (await exportDrafts([])).arrayBuffer(),
    );
    expect(
      JSON.parse(await zip.file("deleted-files.json")!.async("string")),
    ).toEqual(["public/images/list01/old.webp"]);
  });
});
