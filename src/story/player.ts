import { claimSpeech, canCancelSpeech, releaseSpeech } from "../speechChannel";
import {
  flattenStory,
  type Story,
  type StorySettings,
  type StoryPosition,
  type StoryStatus,
} from "./types";
export interface StorySnapshot extends StoryPosition {
  status: StoryStatus;
  error?: string;
}
export function assignCharacterVoices(
  story: Story,
  voices: SpeechSynthesisVoice[],
  settings: StorySettings,
) {
  const english = voices.filter((v) => v.lang.toLowerCase().startsWith("en"));
  const pool = [
    ...english.filter((v) => v.lang.toLowerCase() === "en-us"),
    ...english.filter((v) => v.lang.toLowerCase() !== "en-us"),
  ];
  const used = new Set<string>();
  const result: Record<string, SpeechSynthesisVoice | null> = {};
  for (const character of story.characters) {
    const preferred = settings.voices[character.id] || character.preferredVoice;
    const voice =
      pool.find((v) => v.voiceURI === preferred || v.name === preferred) ??
      pool.find((v) => !used.has(v.voiceURI)) ??
      pool[0] ??
      null;
    result[character.id] = voice;
    if (voice) used.add(voice.voiceURI);
  }
  return result;
}
export class StoryPlayer {
  snapshot: StorySnapshot = { status: "idle", sceneIndex: 0, lineIndex: 0 };
  private generation = 0;
  private utterance: SpeechSynthesisUtterance | undefined;
  private next: (() => void) | undefined;
  private voices: Record<string, SpeechSynthesisVoice | null> = {};
  private config: StorySettings | undefined;
  constructor(
    private story: Story,
    private synth: SpeechSynthesis,
    private changed: (s: StorySnapshot) => void,
    private make = () => new SpeechSynthesisUtterance(),
  ) {}
  private emit(p: Partial<StorySnapshot>) {
    this.snapshot = { ...this.snapshot, error: undefined, ...p };
    this.changed({ ...this.snapshot });
  }
  private cancel() {
    this.generation++;
    this.next = undefined;
    if (this.utterance) {
      this.utterance.onend = null;
      this.utterance.onerror = null;
      this.utterance = undefined;
    }
    if (canCancelSpeech(this, this.synth)) {
      this.synth.cancel();
      if (this.synth.paused) this.synth.resume();
    }
    releaseSpeech(this, this.synth);
  }
  stop(reset = true) {
    this.cancel();
    this.emit({
      status: "idle",
      ...(reset ? { sceneIndex: 0, lineIndex: 0 } : {}),
    });
  }
  play(
    config: StorySettings,
    position: StoryPosition = this.snapshot,
    startPaused = false,
  ) {
    this.cancel();
    claimSpeech(this, () => this.stop(false), this.synth);
    this.config = { ...config, voices: { ...config.voices } };
    this.voices = assignCharacterVoices(
      this.story,
      this.synth.getVoices(),
      this.config,
    );
    const flat = flattenStory(this.story);
    let index = flat.findIndex(
      (p) =>
        p.sceneIndex === position.sceneIndex &&
        p.lineIndex === position.lineIndex,
    );
    if (index < 0) index = 0;
    let phase = 0;
    const token = this.generation;
    this.emit({
      sceneIndex: flat[index].sceneIndex,
      lineIndex: flat[index].lineIndex,
      status: startPaused ? "paused" : "playing",
    });
    const advance = () => {
      if (token !== this.generation) return;
      if (this.snapshot.status === "paused") {
        this.next = advance;
        return;
      }
      if (this.snapshot.status !== "playing") return;
      const item = flat[index];
      if (!item) {
        this.cancel();
        this.emit({ status: "completed" });
        return;
      }
      this.emit({ sceneIndex: item.sceneIndex, lineIndex: item.lineIndex });
      const zh =
        this.config!.mode === "zh" ||
        (this.config!.mode === "bilingual" && phase === 1);
      const u = this.make();
      this.utterance = u;
      u.text = zh ? item.line.zh : item.line.en;
      u.lang = zh ? "zh-CN" : "en-US";
      const all = this.synth.getVoices();
      u.voice = zh
        ? (all.find(
            (v) =>
              v.voiceURI === this.config!.zhVoice && v.lang.startsWith("zh"),
          ) ??
          all.find((v) => v.lang.startsWith("zh")) ??
          null)
        : this.voices[item.line.speakerId];
      u.rate = zh ? this.config!.zhRate : this.config!.enRate;
      u.pitch = this.config!.pitch;
      u.volume = this.config!.volume;
      u.onend = () => {
        if (token !== this.generation || this.utterance !== u) return;
        u.onend = null;
        u.onerror = null;
        this.utterance = undefined;
        if (this.config!.mode === "bilingual" && phase === 0) phase = 1;
        else {
          phase = 0;
          index++;
        }
        if (this.snapshot.status === "paused") {
          this.next = advance;
          return;
        }
        advance();
      };
      u.onerror = (e) => {
        if (token !== this.generation || this.utterance !== u) return;
        this.cancel();
        this.emit({
          status: "error",
          error: `朗读中断：${e.error}，请重新播放。`,
        });
      };
      try {
        this.synth.speak(u);
      } catch (e) {
        this.cancel();
        this.emit({ status: "error", error: String(e) });
      }
    };
    advance();
  }
  pause() {
    if (this.snapshot.status !== "playing") return;
    this.emit({ status: "paused" });
    this.synth.pause();
  }
  resume() {
    if (this.snapshot.status !== "paused") return;
    this.emit({ status: "playing" });
    this.synth.resume();
    const next = this.next;
    this.next = undefined;
    next?.();
  }
  seek(position: StoryPosition) {
    const active = this.snapshot.status === "playing";
    const paused = this.snapshot.status === "paused";
    if ((active || paused) && this.config)
      this.play(this.config, position, paused);
    else {
      this.cancel();
      this.emit({ ...position, status: "idle" });
    }
  }
}
