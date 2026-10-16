import { useEffect, useRef, useState, Fragment } from "react";
import { asset, type Word } from "../types";
import { useStore } from "../store";
import { loadStory, targetPattern } from "./data";
import { flattenStory, type Story, type StoryStatus } from "./types";
import { StoryPlayer, type StorySnapshot } from "./player";
import { useStoryStore } from "./store";
import "./story.css";
function Rate({
  label,
  value,
  onCommit,
}: {
  label: string;
  value: number;
  onCommit: (n: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const commit = () => {
    const number = Number(draft);
    if (!draft.trim() || !Number.isFinite(number)) {
      setDraft(String(value));
      return;
    }
    const n = Math.min(2, Math.max(0.5, number));
    setDraft(String(n));
    if (n !== value) onCommit(n);
  };
  return (
    <label>
      {label}
      <input
        type="number"
        min="0.5"
        max="2"
        step="0.1"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
      />
    </label>
  );
}
export function HighlightedLine({
  text,
  words,
}: {
  text: string;
  words: Word[];
}) {
  const alternatives = [
    ...new Set(words.map((w) => targetPattern(w.word))),
  ].sort((a, b) => b.length - a.length);
  if (!alternatives.length) return <>{text}</>;
  const regex = new RegExp(`\\b(${alternatives.join("|")})\\b`, "gi");
  const parts = text.split(regex);
  return (
    <>
      {parts.map((part, i) => (
        <Fragment key={i}>
          {i % 2 ? (
            <mark
              title={words
                .filter((w) =>
                  new RegExp(`^${targetPattern(w.word)}$`, "i").test(part),
                )
                .map((w) => `${w.word}：${w.meaning}`)
                .join("\n")}
            >
              {part}
            </mark>
          ) : (
            part
          )}
        </Fragment>
      ))}
    </>
  );
}
export default function StoryReview({
  listId,
  words,
  onStatus,
}: {
  listId: string;
  words: Word[];
  onStatus: (status: StoryStatus) => void;
}) {
  const [story, setStory] = useState<Story | null>(null),
    [loadError, setLoadError] = useState(""),
    [open, setOpen] = useState(false),
    [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]),
    [snapshot, setSnapshot] = useState<StorySnapshot>({
      status: "idle",
      sceneIndex: 0,
      lineIndex: 0,
    }),
    [failedImages, setFailedImages] = useState<Set<string>>(new Set());
  const controller = useRef<StoryPlayer | null>(null),
    container = useRef<HTMLElement | null>(null);
  const onStatusRef = useRef(onStatus);
  onStatusRef.current = onStatus;
  const preferences = useStoryStore();
  const global = useStore((s) => s.settings);
  useEffect(() => {
    const abort = new AbortController();
    loadStory(listId, words, abort.signal)
      .then(setStory)
      .catch((e) => {
        if (!abort.signal.aborted) setLoadError(String(e));
      });
    return () => abort.abort();
  }, [listId, words]);
  useEffect(() => {
    if (!story || !("speechSynthesis" in window)) return;
    const synth = window.speechSynthesis;
    const refresh = () => setVoices(synth.getVoices());
    refresh();
    synth.addEventListener("voiceschanged", refresh);
    controller.current = new StoryPlayer(story, synth, (s) => {
      setSnapshot(s);
      onStatusRef.current(s.status);
    });
    const visibility = () => {
      if (document.hidden) controller.current?.pause();
    };
    const hide = () => controller.current?.stop(false);
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("pagehide", hide);
    return () => {
      controller.current?.stop(false);
      controller.current = null;
      synth.removeEventListener("voiceschanged", refresh);
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("pagehide", hide);
    };
  }, [story]);
  const scene = story?.scenes[snapshot.sceneIndex],
    line = scene?.lines[snapshot.lineIndex],
    flat = story ? flattenStory(story) : [],
    current = flat.findIndex(
      (p) =>
        p.sceneIndex === snapshot.sceneIndex &&
        p.lineIndex === snapshot.lineIndex,
    );
  const desiredImage = line?.image || scene?.image || "";
  const image =
    failedImages.has(desiredImage) && desiredImage !== scene?.image
      ? (scene?.image ?? "")
      : desiredImage;
  useEffect(() => {
    if (
      snapshot.status !== "playing" ||
      !global.wake ||
      !("wakeLock" in navigator)
    )
      return;
    let disposed = false;
    let lock: WakeLockSentinel | undefined;
    navigator.wakeLock
      .request("screen")
      .then((result) => {
        if (disposed || document.hidden) void result.release();
        else lock = result;
      })
      .catch(() => {});
    return () => {
      disposed = true;
      void lock?.release();
    };
  }, [snapshot.status, global.wake]);
  useEffect(() => {
    const next = flat[current + 1];
    const src = next?.line.image || next?.scene.image;
    if (src && src !== image) {
      const preload = new Image();
      preload.src = asset(src);
    }
  }, [story, current, image]);
  function settings() {
    return {
      mode: preferences.mode,
      enRate: preferences.enRate,
      zhRate: preferences.zhRate,
      voices: preferences.voices[story!.id] ?? {},
      zhVoice: global.zhVoice,
      pitch: global.pitch,
      volume: global.volume,
    };
  }
  function changedSetting(change: () => void) {
    controller.current?.stop(false);
    change();
  }
  function start() {
    if (snapshot.status === "paused") controller.current?.resume();
    else {
      controller.current?.play(
        settings(),
        snapshot.status === "completed"
          ? { sceneIndex: 0, lineIndex: 0 }
          : snapshot,
      );
    }
    container.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  function jump(index: number) {
    const position = flat[Math.max(0, Math.min(flat.length - 1, index))];
    if (position) controller.current?.seek(position);
  }
  if (loadError)
    return (
      <section className="story-review">
        <p role="alert">
          故事数据无法加载：{loadError}。单词学习仍可正常使用。
        </p>
      </section>
    );
  if (!story || !scene || !line) return null;
  const targets = words.filter((w) => story.targetWordIds.includes(w.id));
  const covered = new Set(flat.flatMap((p) => p.line.targetWordIds));
  const speaker = story.characters.find((c) => c.id === line.speakerId);
  return (
    <section
      ref={container}
      className={`story-review story-${preferences.layout}`}
      id="story-review"
      aria-label="Story Review 故事复习"
    >
      <button
        className="story-heading"
        aria-expanded={open}
        onClick={() => {
          if (open) controller.current?.stop(false);
          setOpen(!open);
        }}
      >
        <span>
          Story Review — 故事复习
          <small>
            {story.title} · {story.titleZh}
          </small>
        </span>
        <span>{open ? "收起" : "展开"}</span>
      </button>
      {open && (
        <div className="story-content">
          <div className="story-meta">
            <span>
              场景 {snapshot.sceneIndex + 1} / {story.scenes.length} · 对话{" "}
              {current + 1} / {flat.length}
            </span>
            <span>
              词汇记录覆盖 {covered.size} / {words.length}
            </span>
          </div>
          <progress
            aria-label="故事播放进度"
            value={snapshot.status === "completed" ? flat.length : current}
            max={flat.length}
          />
          <div className="story-options">
            <label>
              故事朗读模式
              <select
                value={preferences.mode}
                onChange={(e) =>
                  changedSetting(() =>
                    preferences.patch({
                      mode: e.target.value as typeof preferences.mode,
                    }),
                  )
                }
              >
                <option value="en">英语</option>
                <option value="zh">中文</option>
                <option value="bilingual">英中双语</option>
              </select>
            </label>
            <Rate
              label="故事英语语速"
              value={preferences.enRate}
              onCommit={(enRate) =>
                changedSetting(() => preferences.patch({ enRate }))
              }
            />
            <Rate
              label="故事中文语速"
              value={preferences.zhRate}
              onCommit={(zhRate) =>
                changedSetting(() => preferences.patch({ zhRate }))
              }
            />
            <label>
              故事显示模式
              <select
                value={preferences.layout}
                onChange={(e) =>
                  preferences.patch({
                    layout: e.target.value as typeof preferences.layout,
                  })
                }
              >
                <option value="mixed">图片与文字混合</option>
                <option value="image">图片优先</option>
                <option value="text">文字优先</option>
              </select>
            </label>
          </div>
          <h2>
            {scene.title}
            <small>{scene.titleZh}</small>
          </h2>
          <div className="story-stage">
            <div className="story-picture">
              {image && !failedImages.has(image) ? (
                <img
                  key={image}
                  src={asset(image)}
                  alt={`${scene.titleZh}：${speaker?.name}`}
                  onError={() =>
                    setFailedImages((old) => new Set(old).add(image))
                  }
                />
              ) : (
                <div className="story-placeholder">
                  场景图片待添加<small>可继续阅读和朗读故事</small>
                </div>
              )}
            </div>
            <div className="story-dialogue" aria-live="polite">
              <div className="story-speaker">{speaker?.name}</div>
              <p lang="en" className="story-en">
                <HighlightedLine text={line.en} words={targets} />
              </p>
              <p lang="zh-CN" className="story-zh">
                {line.zh}
              </p>
              <div className="story-targets">
                {line.targetWordIds.map((id) => {
                  const w = words.find((w) => w.id === id);
                  return (
                    w && (
                      <span key={id}>
                        {w.word} · {w.meaning}
                      </span>
                    )
                  );
                })}
              </div>
            </div>
          </div>
          <div className="story-controls">
            <button
              onClick={() =>
                controller.current?.seek({
                  sceneIndex: snapshot.sceneIndex - 1,
                  lineIndex: 0,
                })
              }
              disabled={snapshot.sceneIndex === 0}
            >
              上一场景
            </button>
            <button onClick={() => jump(current - 1)} disabled={current === 0}>
              上一句
            </button>
            <button
              className="story-play"
              onClick={() =>
                snapshot.status === "playing"
                  ? controller.current?.pause()
                  : start()
              }
              disabled={!("speechSynthesis" in window)}
            >
              {snapshot.status === "playing"
                ? "暂停故事"
                : snapshot.status === "paused"
                  ? "继续故事"
                  : "播放故事"}
            </button>
            <button onClick={() => controller.current?.stop()}>停止故事</button>
            <button
              onClick={() => jump(current + 1)}
              disabled={current === flat.length - 1}
            >
              下一句
            </button>
            <button
              onClick={() =>
                controller.current?.seek({
                  sceneIndex: snapshot.sceneIndex + 1,
                  lineIndex: 0,
                })
              }
              disabled={snapshot.sceneIndex === story.scenes.length - 1}
            >
              下一场景
            </button>
          </div>
          <p className="hint" role="status">
            {
              {
                idle: "故事已停止",
                playing: "故事正在朗读",
                paused: "故事已暂停",
                completed: "故事朗读完成",
                error: "故事朗读出错",
              }[snapshot.status]
            }{" "}
            {snapshot.error}
          </p>
          <details>
            <summary>角色声音设置</summary>
            <p className="hint">
              优先分配不同的美式英语声音。声音数量和性别由系统决定；不足时共享可用声音，不以角色性别保证音色。
            </p>
            {!voices.some((v) => v.lang.startsWith("en")) && (
              <p>当前没有英语声音，将尝试系统默认语音。</p>
            )}
            {!voices.some((v) => v.lang.startsWith("zh")) && (
              <p>当前没有中文声音，将尝试系统默认语音。</p>
            )}
            <div className="story-options">
              {story.characters.map((c) => (
                <label key={c.id}>
                  {c.name} 英语声音
                  <select
                    value={preferences.voices[story.id]?.[c.id] ?? ""}
                    onChange={(e) =>
                      changedSetting(() =>
                        preferences.voice(story.id, c.id, e.target.value),
                      )
                    }
                  >
                    <option value="">自动分配</option>
                    {voices
                      .filter((v) => v.lang.startsWith("en"))
                      .map((v) => (
                        <option key={v.voiceURI} value={v.voiceURI}>
                          {v.name} ({v.lang})
                        </option>
                      ))}
                  </select>
                </label>
              ))}
            </div>
          </details>
          <details>
            <summary>当前场景全部对话</summary>
            <div className="story-transcript">
              {scene.lines.map((l, i) => (
                <button
                  key={l.id}
                  className={i === snapshot.lineIndex ? "active" : ""}
                  onClick={() =>
                    controller.current?.seek({
                      sceneIndex: snapshot.sceneIndex,
                      lineIndex: i,
                    })
                  }
                >
                  <strong>
                    {story.characters.find((c) => c.id === l.speakerId)?.name}
                  </strong>
                  <span>{l.en}</span>
                  <small>{l.zh}</small>
                </button>
              ))}
            </div>
          </details>
        </div>
      )}
    </section>
  );
}
