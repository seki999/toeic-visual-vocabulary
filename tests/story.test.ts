import { describe, it, expect, vi, afterEach } from "vitest";
import { validateStory, loadStory, targetPattern } from "../src/story/data";
import { StoryPlayer, assignCharacterVoices } from "../src/story/player";
import { SpeechPlayer } from "../src/speech";
import { defaults } from "../src/store";
import type { Story, StorySettings } from "../src/story/types";
import vocabulary from "../public/data/list01.json";
import official from "../public/stories/list01.story.json";
import type { Word } from "../src/types";
const settings: StorySettings = {
  mode: "bilingual",
  enRate: 0.8,
  zhRate: 1.2,
  voices: {},
  zhVoice: "zh",
  pitch: 1,
  volume: 1,
};
const story: Story = {
  schemaVersion: 1,
  id: "test",
  listId: "list01",
  title: "Test",
  titleZh: "测试",
  targetWordIds: ["v000001"],
  characters: [
    { id: "a", name: "A" },
    { id: "b", name: "B" },
  ],
  scenes: [
    {
      id: "s1",
      title: "One",
      titleZh: "一",
      image: "images/stories/list01/a.webp",
      lines: [
        {
          id: "l1",
          speakerId: "a",
          en: "abstain",
          zh: "戒酒",
          targetWordIds: ["v000001"],
          image: null,
        },
        {
          id: "l2",
          speakerId: "b",
          en: "Thank you.",
          zh: "谢谢。",
          targetWordIds: [],
          image: null,
        },
      ],
    },
    {
      id: "s2",
      title: "Two",
      titleZh: "二",
      lines: [
        {
          id: "l3",
          speakerId: "a",
          en: "Goodbye.",
          zh: "再见。",
          targetWordIds: [],
        },
      ],
    },
  ],
};
const disposables: StoryPlayer[] = [];
afterEach(() => {
  disposables.splice(0).forEach((p) => p.stop());
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function mock() {
  const spoken: any[] = [];
  const voices = [
    { voiceURI: "en1", name: "First", lang: "en-US" },
    { voiceURI: "en2", name: "Second", lang: "en-US" },
    { voiceURI: "uk", name: "UK", lang: "en-GB" },
    { voiceURI: "zh", name: "中文", lang: "zh-CN" },
  ] as SpeechSynthesisVoice[];
  const synth = {
    cancel: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    getVoices: () => voices,
    speak: (u: any) => spoken.push(u),
  };
  const changed = vi.fn();
  const player = new StoryPlayer(
    story,
    synth as any,
    changed,
    () => ({}) as SpeechSynthesisUtterance,
  );
  disposables.push(player);
  return { spoken, voices, synth, player, changed };
}
describe("story data", () => {
  it("validates the complete real story without changing vocabulary items", () => {
    const data = validateStory(official, "list01", vocabulary.items as Word[]);
    expect(data.scenes).toHaveLength(5);
    expect(
      new Set(
        data.scenes.flatMap((s) => s.lines.flatMap((l) => l.targetWordIds)),
      ).size,
    ).toBe(50);
    expect(vocabulary.items).toHaveLength(50);
  });
  it("rejects duplicate line IDs, unknown speakers, traversal and invalid targets", () => {
    for (const change of [
      (s: Story) => {
        s.scenes[0].lines[1].id = "l1";
      },
      (s: Story) => {
        s.scenes[0].lines[0].speakerId = "missing";
      },
      (s: Story) => {
        s.scenes[0].image = "images/../bad.webp";
      },
      (s: Story) => {
        s.targetWordIds = ["missing"];
      },
    ]) {
      const s = structuredClone(story);
      change(s);
      expect(() =>
        validateStory(s, "list01", vocabulary.items as Word[]),
      ).toThrow();
    }
  });
  it("accepts inflected forms and keeps same-spelling records separate", () => {
    expect(new RegExp(targetPattern("gape"), "i").test("gaping")).toBe(true);
    expect(new RegExp(targetPattern("paparazzo"), "i").test("paparazzi")).toBe(
      true,
    );
    expect(official.targetWordIds).toContain("v000001");
    expect(official.targetWordIds).toContain("v000002");
  });
  it("does not request a story for a list missing from the manifest", async () => {
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ listIds: ["list01"] }),
    });
    vi.stubGlobal("fetch", fetch);
    expect(await loadStory("list02", [])).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("treats a dev-server HTML fallback as an absent optional manifest", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "text/html" }),
        json: async () => {
          throw Error("HTML is not JSON");
        },
      }),
    );
    expect(await loadStory("list01", [])).toBeNull();
  });
  it("treats a missing story file as optional", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ listIds: ["list01"] }),
        })
        .mockResolvedValueOnce({ ok: false, status: 404 }),
    );
    expect(await loadStory("list01", [])).toBeNull();
  });
});
describe("story player", () => {
  it("assigns distinct US voices and respects saved overrides", () => {
    const m = mock();
    const assignment = assignCharacterVoices(story, m.voices, settings);
    expect(assignment.a?.voiceURI).toBe("en1");
    expect(assignment.b?.voiceURI).toBe("en2");
    expect(
      assignCharacterVoices(story, m.voices, {
        ...settings,
        voices: { a: "uk" },
      }).a?.voiceURI,
    ).toBe("uk");
    expect(assignCharacterVoices(story, [], settings).a).toBeNull();
    expect(
      assignCharacterVoices(story, [m.voices[0]], settings).b?.voiceURI,
    ).toBe("en1");
  });
  it("uses separate language voices and rates, advances scenes and completes", () => {
    const m = mock();
    m.player.play(settings);
    expect(m.spoken[0]).toMatchObject({
      lang: "en-US",
      rate: 0.8,
      text: "abstain",
    });
    m.spoken[0].onend();
    expect(m.spoken[1]).toMatchObject({
      lang: "zh-CN",
      rate: 1.2,
      text: "戒酒",
    });
    for (let n = 1; n < 6; n++) m.spoken[n].onend();
    expect(m.player.snapshot.status).toBe("completed");
    expect(m.player.snapshot.sceneIndex).toBe(1);
  });
  it("keeps paused completion callbacks from starting a new utterance", () => {
    const m = mock();
    m.player.play(settings);
    m.player.pause();
    m.spoken[0].onend();
    expect(m.spoken).toHaveLength(1);
    expect(m.player.snapshot.status).toBe("paused");
    m.player.resume();
    expect(m.spoken[1].lang).toBe("zh-CN");
  });
  it("ignores stale callbacks after rapid seeks, config changes and stops", () => {
    const m = mock();
    m.player.play(settings);
    const old = m.spoken[0].onend;
    m.player.seek({ sceneIndex: 1, lineIndex: 0 });
    old();
    expect(m.spoken).toHaveLength(2);
    expect(m.spoken[1].text).toBe("Goodbye.");
    const next = m.spoken[1].onend;
    m.player.stop();
    next();
    expect(m.player.snapshot.status).toBe("idle");
    expect(m.spoken).toHaveLength(2);
  });
  it("seeks while paused without speaking until resume", () => {
    const m = mock();
    m.player.play(settings);
    m.player.pause();
    m.player.seek({ sceneIndex: 1, lineIndex: 0 });
    expect(m.spoken).toHaveLength(1);
    expect(m.player.snapshot.status).toBe("paused");
    m.player.resume();
    expect(m.spoken[1].text).toBe("Goodbye.");
  });
  it("uses Chinese-only or English-only mode and reports speech errors", () => {
    const m = mock();
    m.player.play({ ...settings, mode: "zh" });
    expect(m.spoken[0].text).toBe("戒酒");
    m.spoken[0].onerror({ error: "network" });
    expect(m.player.snapshot.status).toBe("error");
    m.player.play({ ...settings, mode: "en" });
    m.spoken[1].onend();
    expect(m.spoken[2].text).toBe("Thank you.");
  });
  it("mutually excludes vocabulary speech and protects the active owner from unrelated stops", () => {
    const m = mock();
    const word = new SpeechPlayer(
      m.synth as any,
      vi.fn(),
      vi.fn(),
      vi.fn(),
      () => ({}) as SpeechSynthesisUtterance,
    );
    word.play(vocabulary.items as Word[], 0, defaults);
    const old = m.spoken[0].onend;
    m.player.play(settings);
    expect(word.status).toBe("stopped");
    old();
    expect(m.spoken).toHaveLength(2);
    const calls = m.synth.cancel.mock.calls.length;
    word.stop();
    expect(m.synth.cancel).toHaveBeenCalledTimes(calls);
    word.play(vocabulary.items as Word[], 0, defaults);
    expect(m.player.snapshot.status).toBe("idle");
    word.stop();
  });
});
