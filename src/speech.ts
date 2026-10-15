import { fieldText, language, type Word } from "./types";
import { type Settings } from "./store";
export type Status = "stopped" | "playing" | "paused";
export class SpeechPlayer {
  private generation = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private pending: (() => void) | undefined;
  private remaining = 0;
  private deadline = 0;
  private utterance: SpeechSynthesisUtterance | undefined;
  private activeSettings: Settings | undefined;
  setRate(language: "en" | "zh", rate: number) {
    if (this.activeSettings) {
      if (language === "zh") this.activeSettings.zhRate = rate;
      else this.activeSettings.enRate = rate;
    }
  }
  status: Status = "stopped";
  constructor(
    private synth: SpeechSynthesis,
    private changed: (s: Status) => void,
    private focus: (n: number) => void,
    private failure: (s: string) => void,
    private make = () => new SpeechSynthesisUtterance(),
  ) {}
  stop() {
    this.generation++;
    clearTimeout(this.timer);
    this.timer = undefined;
    this.pending = undefined;
    this.remaining = 0;
    this.deadline = 0;
    if (this.utterance) {
      this.utterance.onend = null;
      this.utterance.onerror = null;
      this.utterance = undefined;
    }
    this.status = "stopped";
    this.activeSettings = undefined;
    this.synth.cancel();
    // cancel() clears queued speech but does not reset the browser's paused flag.
    // Resume only the now-empty queue so the next play starts a fresh utterance.
    if (this.synth.paused) this.synth.resume();
    this.changed(this.status);
  }
  pause() {
    if (this.status !== "playing") return;
    this.status = "paused";
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
      this.remaining = Math.max(0, this.deadline - Date.now());
    }
    this.synth.pause();
    this.changed(this.status);
  }
  resume() {
    if (this.status !== "paused") return;
    this.status = "playing";
    this.synth.resume();
    this.changed(this.status);
    if (this.pending) this.schedule(this.pending, this.remaining);
  }
  private schedule(fn: () => void, ms: number) {
    this.pending = fn;
    this.remaining = ms;
    if (this.status === "paused") return;
    this.deadline = Date.now() + ms;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      this.pending = undefined;
      fn();
    }, ms);
  }
  play(items: Word[], start: number, settings: Settings) {
    this.stop();
    const c = { ...settings };
    this.activeSettings = c;
    if (!items.length || !c.order.length) return;
    const token = this.generation;
    this.status = "playing";
    this.changed(this.status);
    let index = start,
      cycle = 0,
      field = 0,
      repeated = 0;
    const next = () => {
      if (token !== this.generation) return;
      const w = items[index];
      if (!w) {
        this.stop();
        return;
      }
      if (field === 0 && repeated === 0 && cycle === 0) this.focus(index);
      if (field >= c.order.length) {
        field = 0;
        cycle++;
        if (cycle >= c.repeat) {
          cycle = 0;
          if (!c.currentOnly) index++;
          if (index >= items.length) {
            if (c.loop) index = 0;
            else {
              this.stop();
              return;
            }
          }
          if (c.currentOnly && !c.loop) {
            this.stop();
            return;
          }
          this.schedule(next, c.itemGap);
        } else this.schedule(next, c.gap);
        return;
      }
      const f = c.order[field],
        text = fieldText(w, f);
      if (!text) {
        field++;
        next();
        return;
      }
      const u = this.make();
      this.utterance = u;
      u.text = text;
      const zh = language(f) === "zh-CN";
      u.lang = zh ? "zh-CN" : c.accent;
      const voices = this.synth.getVoices();
      u.voice =
        voices.find((v) => v.voiceURI === (zh ? c.zhVoice : c.enVoice)) ??
        voices.find((v) => v.lang === u.lang) ??
        voices.find((v) => v.lang.startsWith(zh ? "zh" : "en")) ??
        null;
      u.rate = zh ? c.zhRate : c.enRate;
      u.pitch = c.pitch;
      u.volume = c.volume;
      u.onend = () => {
        if (token !== this.generation) return;
        this.utterance = undefined;
        repeated++;
        if (repeated >= c.fieldRepeat) {
          repeated = 0;
          field++;
        }
        this.schedule(next, c.gap);
      };
      u.onerror = (e) => {
        if (token !== this.generation) return;
        this.stop();
        this.failure(`朗读中断：${e.error}。请重新点击播放。`);
      };
      this.synth.speak(u);
    };
    next();
  }
}
