import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useNavigate, useParams, Routes, Route } from "react-router-dom";
import {
  BookOpen,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Square,
  Settings2,
  ImagePlus,
  Download,
  Search,
  Menu,
  X,
  Volume2,
  ArrowUp,
  ArrowDown,
  Trash2,
  Maximize2,
} from "lucide-react";
import {
  asset,
  fields,
  labels,
  fieldText,
  type List,
  type Word,
  type Picture,
  type Manifest,
  type Field,
} from "./types";
import { useStore, type Settings } from "./store";
import { SpeechPlayer, type Status } from "./speech";
import { connectLocalEditor, saveLocalWord } from "./localEditor";
import {
  saveWord,
  loadWords,
  imageBlob,
  storeImage,
  deleteImage,
  exportDrafts,
  prepareImage,
  clearDrafts,
} from "./drafts";
function PictureView({
  picture,
  onOpen,
}: {
  picture: Picture;
  onOpen: () => void;
}) {
  const [src, setSrc] = useState(asset(picture.src));
  useEffect(() => {
    let url = "",
      alive = true;
    setSrc(asset(picture.src));
    imageBlob(picture.src).then((blob) => {
      if (blob && alive) {
        url = URL.createObjectURL(blob);
        setSrc(url);
      }
    });
    return () => {
      alive = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [picture.src]);
  return (
    <img
      className={
        picture.heightMode === "fixed" ? "fixed-height" : "auto-height"
      }
      onDoubleClick={onOpen}
      src={src}
      alt={picture.alt}
      style={{
        width: `${picture.widthPercent}%`,
        height:
          picture.heightMode === "fixed" ? (picture.height ?? 300) : "auto",
        aspectRatio:
          picture.heightMode === "fixed" ||
          !picture.aspectRatio ||
          picture.aspectRatio === "original"
            ? undefined
            : picture.aspectRatio,
        objectFit: picture.objectFit,
        objectPosition: picture.objectPosition,
        transform: `rotate(${picture.rotation}deg) scale(${picture.zoom ?? 1})`,
      }}
    />
  );
}
function NumericSettingInput({
  value,
  min,
  max,
  step,
  onCommit,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  function commit() {
    const parsed = Number(draft);
    if (draft.trim() === "" || !Number.isFinite(parsed)) {
      setDraft(String(value));
      return;
    }
    const normalized = Math.min(max, Math.max(min, parsed));
    setDraft(String(normalized));
    if (normalized !== value) onCommit(normalized);
  }
  return (
    <input
      type="number"
      min={min}
      max={max}
      step={step}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
      }}
    />
  );
}
function Reader() {
  const navigate = useNavigate(),
    params = useParams();
  const {
    settings: c,
    set,
    setList,
    listId,
    positions,
    setPosition,
  } = useStore();
  const [manifest, setManifest] = useState<Manifest>();
  const [lists, setLists] = useState<List[]>([]);
  const [drafts, setDrafts] = useState<Word[]>([]);
  const [localSaving, setLocalSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  useEffect(() => {
    connectLocalEditor()
      .then(setLocalSaving)
      .catch((e) => setError(String(e)));
  }, []);
  const [status, setStatus] = useState<Status>("stopped");
  const [panel, setPanel] = useState<"speech" | "display" | "edit" | null>(
    null,
  );
  const [controlsVisible, setControlsVisible] = useState(true);
  const [controlsActivity, setControlsActivity] = useState(0);
  const [compactScreen, setCompactScreen] = useState(
    () => matchMedia("(max-width:1366px)").matches,
  );
  useEffect(() => {
    const media = matchMedia("(max-width:1366px)");
    const change = () => {
      setCompactScreen(media.matches);
      setControlsVisible(true);
    };
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, []);
  useEffect(() => {
    if (status !== "playing" || !compactScreen) {
      setControlsVisible(true);
      return;
    }
    if (!controlsVisible || panel) return;
    const timer = setTimeout(() => setControlsVisible(false), 4000);
    return () => clearTimeout(timer);
  }, [status, compactScreen, controlsVisible, controlsActivity, panel]);
  function showControls() {
    setControlsVisible(true);
    setControlsActivity((n) => n + 1);
  }
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [query, setQuery] = useState("");
  const [drawer, setDrawer] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState("");
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [following, setFollowing] = useState(true);
  const [lightbox, setLightbox] = useState<Picture>();
  const [imageZoomed, setImageZoomed] = useState(false);
  useEffect(() => {
    setImageZoomed(false);
    if (!lightbox) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const close = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightbox(undefined);
    };
    window.addEventListener("keydown", close);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", close);
    };
  }, [lightbox]);
  const refs = useRef<Record<string, HTMLElement | null>>({});
  const addingImages = useRef(new Set<string>());
  const player = useRef<SpeechPlayer | null>(null);
  const list = lists.find((l) => l.id === listId);
  const index = Math.min(
    positions[listId] ?? 0,
    Math.max(0, (list?.items.length ?? 1) - 1),
  );
  const current = list?.items[index];
  // Preserve newly published images when an older browser draft overrides a word.
  // A draft may predate image additions in public/data/listXX.json.
  const merged =
    list?.items.map((w) => {
      const draft = drafts.find((d) => d.id === w.id);
      if (!draft) return w;
      // Draft images often have UUID/WebP names while the same published
      // image has a PNG name. Combining both arrays displays duplicates.
      // Keep the user's draft images when present; otherwise use published
      // images so old text-only drafts cannot hide newly published photos.
      return {
        ...draft,
        images: draft.images.length > 0 ? draft.images : w.images,
      };
    }) ?? [];
  useEffect(() => {
    let alive = true;
    Promise.all([
      fetch(asset("data/manifest.json")).then((r) => {
        if (!r.ok) throw Error("无法加载词汇清单");
        return r.json() as Promise<Manifest>;
      }),
      loadWords(),
    ])
      .then(async ([m, d]) => {
        const all = await Promise.all(
          m.lists.map((e) =>
            fetch(asset(e.file)).then((r) => {
              if (!r.ok) throw Error(`无法加载 ${e.title}`);
              return r.json() as Promise<List>;
            }),
          ),
        );
        if (alive) {
          setManifest(m);
          setLists(all);
          setDrafts(d);
        }
      })
      .catch((e) => setError(String(e)));
    return () => {
      alive = false;
    };
  }, []);
  useEffect(() => {
    if (params.listId && lists.some((l) => l.id === params.listId))
      setList(params.listId);
  }, [params.listId, lists, setList]);
  useEffect(() => {
    if (!("speechSynthesis" in window)) {
      setError("此浏览器不支持系统朗读。");
      return;
    }
    const synth = window.speechSynthesis;
    const refresh = () => setVoices(synth.getVoices());
    refresh();
    synth.addEventListener("voiceschanged", refresh);
    player.current = new SpeechPlayer(
      synth,
      setStatus,
      (n) => setPosition(useStore.getState().listId, n),
      setError,
    );
    return () => {
      player.current?.stop();
      synth.removeEventListener("voiceschanged", refresh);
    };
  }, [setPosition]);
  // Changing speech speed must not stop playback. Other playback settings
  // continue to reset the player, as they may alter its reading sequence.
  const previousPlaybackSettings = useRef({ listId, settings: c });
  useEffect(() => {
    const previous = previousPlaybackSettings.current;
    const changedOtherSettings = (Object.keys(c) as (keyof Settings)[]).some(
      (key) => key !== "rate" && previous.settings[key] !== c[key],
    );
    if (previous.listId !== listId || changedOtherSettings) {
      player.current?.stop();
    }
    previousPlaybackSettings.current = { listId, settings: c };
  }, [listId, c]);
  function scrollToWord(id: string) {
    const card = refs.current[id];
    if (!card) return;
    const main = card.closest("main");
    const available =
      main && getComputedStyle(main).overflowY === "auto"
        ? main.clientHeight
        : window.innerHeight - 130;
    card.scrollIntoView({
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
      block: card.clientHeight > available ? "start" : c.scrollPosition,
    });
  }
  useEffect(() => {
    if (
      c.autoScroll &&
      following &&
      current &&
      player.current?.status !== "stopped"
    )
      scrollToWord(current.id);
  }, [current?.id, c.autoScroll, c.scrollPosition, following]);
  useEffect(() => {
    let lock: any;
    let disposed = false;
    async function acquire() {
      try {
        if (
          c.wake &&
          status === "playing" &&
          document.visibilityState === "visible"
        ) {
          if (!("wakeLock" in navigator)) {
            setError("当前浏览器不支持屏幕常亮。");
            return;
          }
          if (lock && !lock.released) return;
          const result = await navigator.wakeLock.request("screen");
          if (disposed || status !== "playing" || document.hidden) {
            await result.release();
          } else {
            lock = result;
          }
        }
      } catch {
        setError("无法开启屏幕常亮，请检查浏览器权限。");
      }
    }
    function visibility() {
      if (document.hidden) {
        // Do not pause speech when the phone locks or the tab goes background.
        // Browsers may still suspend Web Speech independently.
        lock?.release();
        lock = undefined;
      } else void acquire();
    }
    void acquire();
    document.addEventListener("visibilitychange", visibility);
    const hide = () => player.current?.stop();
    window.addEventListener("pagehide", hide);
    return () => {
      disposed = true;
      lock?.release();
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("pagehide", hide);
    };
  }, [c.wake, status]);
  async function update(w: Word) {
    try {
      await saveWord(w);
      setDrafts((d) => [...d.filter((x) => x.id !== w.id), w]);
      if (localSaving) {
        setSaveMessage("正在保存到项目…");
        try {
          await saveLocalWord(listId, w);
          setSaveMessage("已保存到项目文件夹");
        } catch (e) {
          setError(`浏览器草稿已保留，本地保存失败：${e}`);
          setSaveMessage("本地保存失败，可重试");
        }
      }
    } catch {
      setError("草稿保存失败，请检查浏览器存储空间。");
    }
  }
  async function add(w: Word, files: File[]) {
    if (!files.length) return;
    if (w.images.length || addingImages.current.has(w.id)) {
      setError("每个词条只能添加一张图片，请使用「更换」修改现有图片。");
      return;
    }
    if (files.length > 1) {
      setError("每个词条只能添加一张图片，请一次选择一张。");
      return;
    }
    addingImages.current.add(w.id);
    try {
      const images: Picture[] = [];
      for (const file of files) {
        const blob = await prepareImage(file, c.compress, c.quality);
        const id = crypto.randomUUID(),
          ext =
            blob.type === "image/webp"
              ? "webp"
              : blob.type === "image/png"
                ? "png"
                : "jpg";
        const src = `images/${listId}/${w.id}-${id}.${ext}`;
        await storeImage(src, blob);
        images.push({
          id,
          src,
          alt: w.word,
          widthPercent: 100,
          height: 300,
          objectFit: "contain",
          objectPosition: "center",
          rotation: 0,
          zoom: 1,
        });
      }
      await update({ ...w, images: [...w.images, ...images] });
    } catch (e) {
      setError(String(e));
    } finally {
      addingImages.current.delete(w.id);
    }
  }
  useEffect(() => {
    function paste(e: ClipboardEvent) {
      if (
        !editing ||
        !selected ||
        (e.target instanceof HTMLElement &&
          ["INPUT", "TEXTAREA"].includes(e.target.tagName))
      )
        return;
      const files = Array.from(e.clipboardData?.files ?? []);
      const w = merged.find((w) => w.id === selected);
      if (files.length && w) {
        e.preventDefault();
        void add(w, files);
      }
    }
    document.addEventListener("paste", paste);
    return () => document.removeEventListener("paste", paste);
  });
  function play(n = index) {
    setFollowing(true);
    player.current?.play(merged, n, c);
    if (n === index && c.autoScroll && current) scrollToWord(current.id);
  }
  function jump(n: number) {
    const next = Math.max(0, Math.min(merged.length - 1, n));
    setPosition(listId, next);
    if (status !== "stopped") play(next);
  }
  function toggle() {
    if (status === "playing") player.current?.pause();
    else if (status === "paused") player.current?.resume();
    else play();
  }
  function stopPlayback() {
    player.current?.stop();
    setPosition(listId, 0);
    setFollowing(true);
    const first = merged[0];
    if (first) scrollToWord(first.id);
  }
  async function download() {
    try {
      const blob = await exportDrafts(lists);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "toeic-modifications.zip";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setError(`导出失败：${e}`);
    }
  }
  function renderField(w: Word, f: Field) {
    return (
      <div key={f} className={`field field-${f.replace(".", "-")}`}>
        {f !== "word" && <small>{labels[f]}</small>}
        <span>{fieldText(w, f)}</span>
      </div>
    );
  }
  const results = query
    ? lists.flatMap((l) =>
        l.items
          .filter((w) =>
            `${w.word} ${w.meaning} ${w.example.en}`
              .toLowerCase()
              .includes(query.toLowerCase()),
          )
          .map((w) => ({ l, w })),
      )
    : [];
  return (
    <div
      className={`app ${collapsed ? "collapsed" : ""} ${compactScreen && !controlsVisible ? "player-hidden" : ""} ${status !== "stopped" && c.mode === "image" && !editing && !panel && !query ? "image-focus" : ""}`}
      style={
        {
          "--reading-size": `${c.font}px`,
          "--text-ratio": `${c.ratio}%`,
        } as CSSProperties
      }
    >
      <aside className={drawer ? "sidebar open" : "sidebar"}>
        <div className="brand">
          <BookOpen size={25} />
          <div>
            TOEIC<span>VISUAL VOCABULARY</span>
          </div>
          <button
            className="mobile"
            onClick={() => setDrawer(false)}
            aria-label="关闭导航"
          >
            <X />
          </button>
        </div>
        <div className="sidebar-caption">你的词汇学习空间</div>
        <label className="search">
          <Search size={18} />
          <input
            aria-label="搜索词汇"
            placeholder="搜索单词、释义…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <div className="nav-title">
          VOCABULARY LISTS <span>{manifest?.lists.length ?? 0}</span>
        </div>
        <nav>
          {manifest?.lists.map((l, i) => (
            <button
              key={l.id}
              className={l.id === listId ? "nav-item active" : "nav-item"}
              onClick={() => {
                navigate(`/list/${l.id}`);
                setDrawer(false);
                setQuery("");
              }}
            >
              <span className="list-number">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span>
                {l.title}
                <small>{l.count} 个词条</small>
              </span>
              <span className="nav-dot" />
            </button>
          ))}
        </nav>
        <footer>
          <span className="status-dot" /> 浏览器本地学习
          <br />
          <small>{manifest?.total ?? 0} 个词条 · 进度自动保存</small>
        </footer>
      </aside>
      {drawer && <div className="scrim" onClick={() => setDrawer(false)} />}
      <main
        onClickCapture={(e) => {
          if (compactScreen && !controlsVisible) {
            e.stopPropagation();
            e.preventDefault();
            showControls();
          }
        }}
      >
        <header>
          <div className="breadcrumb">
            <button
              aria-label="切换列表菜单"
              onClick={() =>
                window.innerWidth > 1100
                  ? setCollapsed(!collapsed)
                  : setDrawer(!drawer)
              }
            >
              <Menu size={20} />
            </button>
            学习空间 <span>/</span> {list?.title ?? "加载中"}
          </div>
          <div className="header-actions">
            <button
              onClick={async () => {
                if (!localSaving) return;
                try {
                  setSaveMessage("正在保存全部草稿…");
                  for (const w of drafts) {
                    const l = lists.find((l) =>
                      l.items.some((x) => x.id === w.id),
                    );
                    if (l) await saveLocalWord(l.id, w);
                  }
                  setSaveMessage("已保存到项目文件夹");
                } catch (e) {
                  setError(String(e));
                }
              }}
              disabled={!localSaving || !drafts.length}
              title={
                localSaving
                  ? "将草稿写入本地项目"
                  : "仅本地编辑服务支持保存到项目"
              }
            >
              保存到项目
            </button>
            <button
              onClick={() => {
                if (!localSaving) return;
                setEditing(!editing);
                setPanel(editing ? null : "edit");
              }}
              disabled={!localSaving}
              title={
                localSaving ? "编辑词条图片" : "仅本地编辑服务支持图片编辑"
              }
              className={editing ? "selected" : ""}
            >
              <ImagePlus size={17} /> 图片编辑
            </button>
            <button onClick={download} disabled={!drafts.length}>
              <Download size={17} /> 导出修改{" "}
              <small>{drafts.length || ""}</small>
            </button>
          </div>
        </header>
        {localSaving && (
          <div className="hint" role="status">
            本地自动保存已开启 ·{" "}
            {saveMessage || "图片将写入 public/images，词条写入 public/data"}
          </div>
        )}
        <section className="intro">
          <div>
            <div className="eyebrow">LEARN IT. SEE IT. REMEMBER IT.</div>
            <h1>
              {list?.title ?? "Vocabulary"} <span>词汇学习</span>
            </h1>
            <p>让单词与画面连接，在语境中记住每一个表达。</p>
          </div>
          <div className="progress">
            <strong>
              {String(index + 1).padStart(2, "0")}
              <span> / {merged.length}</span>
            </strong>
            <small>当前学习位置</small>
            <div>
              <i
                style={{
                  width: `${merged.length ? ((index + 1) / merged.length) * 100 : 0}%`,
                }}
              />
            </div>
          </div>
        </section>
        <section className="toolbar">
          <div className="modes">
            {(
              [
                ["both", "图文"],
                ["text", "纯文字"],
                ["image", "纯图片"],
              ] as const
            ).map(([mode, title]) => (
              <button
                key={mode}
                className={c.mode === mode ? "selected" : ""}
                onClick={() => set({ mode })}
              >
                {title}
              </button>
            ))}
          </div>
          <div className="toolbar-settings">
            <button
              onClick={() => setPanel(panel === "display" ? null : "display")}
            >
              <Settings2 size={17} /> 显示设置
            </button>
            <button
              onClick={() => setPanel(panel === "speech" ? null : "speech")}
            >
              <Volume2 size={17} /> 朗读设置
            </button>
          </div>
        </section>
        {error && (
          <div role="alert" className="notice">
            {error}
            <button onClick={() => setError("")} aria-label="关闭提示">
              <X size={16} />
            </button>
          </div>
        )}
        {!following && (
          <button className="follow" onClick={() => setFollowing(true)}>
            重新跟随当前词汇
          </button>
        )}
        {panel && (
          <section className="settings-panel">
            <div className="panel-heading">
              <h2>
                {panel === "speech"
                  ? "朗读设置"
                  : panel === "display"
                    ? "显示设置"
                    : "编辑与图片保存"}
              </h2>
              <button onClick={() => setPanel(null)} aria-label="关闭设置">
                <X />
              </button>
            </div>
            {panel === "speech" ? (
              <>
                <div className="settings-grid">
                  <label>
                    英语语音
                    <select
                      value={c.enVoice}
                      onChange={(e) => set({ enVoice: e.target.value })}
                    >
                      <option value="">自动选择</option>
                      {voices
                        .filter((v) => v.lang.startsWith("en"))
                        .map((v) => (
                          <option key={v.voiceURI} value={v.voiceURI}>
                            {v.name} ({v.lang})
                          </option>
                        ))}
                    </select>
                  </label>
                  <label>
                    中文语音
                    <select
                      value={c.zhVoice}
                      onChange={(e) => set({ zhVoice: e.target.value })}
                    >
                      <option value="">自动选择</option>
                      {voices
                        .filter((v) => v.lang.startsWith("zh"))
                        .map((v) => (
                          <option key={v.voiceURI} value={v.voiceURI}>
                            {v.name}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label>
                    英语偏好
                    <select
                      value={c.accent}
                      onChange={(e) =>
                        set({ accent: e.target.value as Settings["accent"] })
                      }
                    >
                      <option value="en-US">美式英语</option>
                      <option value="en-GB">英式英语</option>
                    </select>
                  </label>
                  {(
                    [
                      "rate",
                      "pitch",
                      "volume",
                      "repeat",
                      "fieldRepeat",
                      "gap",
                      "itemGap",
                    ] as const
                  ).map((key) => (
                    <label key={key}>
                      {
                        {
                          rate: "语速 (0.5–2)",
                          pitch: "音调 (0–2)",
                          volume: "音量 (0–1)",
                          repeat: "每词重复 (1–10)",
                          fieldRepeat: "字段重复 (1–5)",
                          gap: "字段间隔 (毫秒)",
                          itemGap: "词条间隔 (毫秒)",
                        }[key]
                      }
                      <NumericSettingInput
                        value={c[key]}
                        min={
                          key === "rate"
                            ? 0.5
                            : key === "repeat" || key === "fieldRepeat"
                              ? 1
                              : 0
                        }
                        max={
                          key === "rate" || key === "pitch"
                            ? 2
                            : key === "volume"
                              ? 1
                              : key === "repeat"
                                ? 10
                                : key === "fieldRepeat"
                                  ? 5
                                  : 30000
                        }
                        step={
                          ["rate", "pitch", "volume"].includes(key) ? 0.1 : 1
                        }
                        onCommit={(value) => {
                          if (key === "rate") {
                            player.current?.setRate(value);
                            if (player.current?.status === "playing") {
                              player.current.play(merged, index, {
                                ...c,
                                rate: value,
                              });
                            }
                          }
                          set({ [key]: value });
                        }}
                      />
                    </label>
                  ))}
                </div>
                {(!voices.some((v) => v.lang.startsWith("zh")) ||
                  !voices.some((v) => v.lang.startsWith("en"))) && (
                  <p className="hint">
                    部分语言没有可用语音，将尝试浏览器默认语音。可在系统中安装英语或中文语音。
                  </p>
                )}
                <div className="presets">
                  {[
                    ["全部朗读", fields],
                    ["只读单词", ["word"]],
                    ["只读例句", ["example.en"]],
                    ["单词 + 例句", ["word", "example.en"]],
                    ["单词 + 释义 + 例句", ["word", "meaning", "example.en"]],
                    ["例句 + 翻译", ["example.en", "example.zh"]],
                  ].map(([name, order]) => (
                    <button
                      key={String(name)}
                      onClick={() => set({ order: order as Field[] })}
                    >
                      {name as string}
                    </button>
                  ))}
                </div>
                <h3>朗读字段与顺序</h3>
                <div className="field-order">
                  {[
                    ...c.order,
                    ...fields.filter((f) => !c.order.includes(f)),
                  ].map((f) => (
                    <div key={f}>
                      <label>
                        <input
                          type="checkbox"
                          checked={c.order.includes(f)}
                          onChange={(e) =>
                            set({
                              order: e.target.checked
                                ? [...c.order, f]
                                : c.order.filter((x) => x !== f),
                            })
                          }
                        />
                        {labels[f]}
                      </label>
                      <button
                        aria-label={`上移${labels[f]}`}
                        disabled={c.order.indexOf(f) <= 0}
                        onClick={() => {
                          const a = [...c.order],
                            i = a.indexOf(f);
                          [a[i - 1], a[i]] = [a[i], a[i - 1]];
                          set({ order: a });
                        }}
                      >
                        <ArrowUp size={14} />
                      </button>
                      <button
                        aria-label={`下移${labels[f]}`}
                        disabled={
                          !c.order.includes(f) ||
                          c.order.indexOf(f) === c.order.length - 1
                        }
                        onClick={() => {
                          const a = [...c.order],
                            i = a.indexOf(f);
                          [a[i + 1], a[i]] = [a[i], a[i + 1]];
                          set({ order: a });
                        }}
                      >
                        <ArrowDown size={14} />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="checks">
                  {(["loop", "currentOnly", "wake"] as const).map((k) => (
                    <label key={k}>
                      <input
                        type="checkbox"
                        checked={c[k]}
                        onChange={(e) => set({ [k]: e.target.checked })}
                      />
                      {
                        {
                          loop: "循环播放",
                          currentOnly: "只播放当前词汇",
                          wake: "播放时屏幕常亮",
                        }[k]
                      }
                    </label>
                  ))}
                </div>
                <p className="hint">
                  播放时默认保持屏幕常亮，暂停或停止后释放；切到其他应用时可能自动释放。可取消勾选关闭此功能。浏览器和手机省电策略可能限制屏幕常亮，锁屏后的连续朗读仍由系统决定。
                </p>
              </>
            ) : panel === "display" ? (
              <>
                <div className="settings-grid">
                  <label>
                    字体大小 {c.font}px
                    <input
                      type="range"
                      min="14"
                      max="30"
                      value={c.font}
                      onChange={(e) => set({ font: +e.target.value })}
                    />
                  </label>
                  <label>
                    文字区域 {c.ratio}%
                    <input
                      type="range"
                      min="30"
                      max="70"
                      value={c.ratio}
                      onChange={(e) => set({ ratio: +e.target.value })}
                    />
                  </label>
                  <label>
                    滚动位置
                    <select
                      value={c.scrollPosition}
                      onChange={(e) =>
                        set({
                          scrollPosition: e.target
                            .value as ScrollLogicalPosition,
                        })
                      }
                    >
                      <option value="start">顶部</option>
                      <option value="center">中央</option>
                      <option value="end">底部</option>
                    </select>
                  </label>
                  <label>
                    覆盖层位置
                    <select
                      value={c.overlayPosition}
                      onChange={(e) =>
                        set({
                          overlayPosition: e.target
                            .value as Settings["overlayPosition"],
                        })
                      }
                    >
                      <option value="top">顶部</option>
                      <option value="center">中间</option>
                      <option value="bottom">底部</option>
                    </select>
                  </label>
                  <label>
                    覆盖文字大小
                    <input
                      type="number"
                      min="12"
                      max="48"
                      value={c.overlaySize}
                      onChange={(e) =>
                        set({
                          overlaySize: Math.max(
                            12,
                            Math.min(48, +e.target.value),
                          ),
                        })
                      }
                    />
                  </label>
                  <label>
                    覆盖文字颜色
                    <input
                      type="color"
                      value={c.overlayColor}
                      onChange={(e) => set({ overlayColor: e.target.value })}
                    />
                  </label>
                  <label>
                    背景透明度
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      value={c.overlayBackground}
                      onChange={(e) =>
                        set({ overlayBackground: +e.target.value })
                      }
                    />
                  </label>
                </div>
                <h3>卡片显示字段</h3>
                <div className="checks">
                  {fields.map((f) => (
                    <label key={f}>
                      <input
                        type="checkbox"
                        checked={c.visible.includes(f)}
                        onChange={(e) =>
                          set({
                            visible: e.target.checked
                              ? [...c.visible, f]
                              : c.visible.filter((x) => x !== f),
                          })
                        }
                      />
                      {labels[f]}
                    </label>
                  ))}
                </div>
                <h3>图片覆盖字段</h3>
                <div className="checks">
                  {fields.map((f) => (
                    <label key={f}>
                      <input
                        type="checkbox"
                        checked={c.overlay.includes(f)}
                        onChange={(e) =>
                          set({
                            overlay: e.target.checked
                              ? [...c.overlay, f]
                              : c.overlay.filter((x) => x !== f),
                          })
                        }
                      />
                      {labels[f]}
                    </label>
                  ))}
                </div>
                <div className="checks">
                  {(["reveal", "autoScroll", "pauseFollow"] as const).map(
                    (k) => (
                      <label key={k}>
                        <input
                          type="checkbox"
                          checked={c[k]}
                          onChange={(e) => set({ [k]: e.target.checked })}
                        />
                        {
                          {
                            reveal: "看图猜词：点击揭示答案",
                            autoScroll: "自动跟随朗读",
                            pauseFollow: "手动滚动后暂停跟随",
                          }[k]
                        }
                      </label>
                    ),
                  )}
                </div>
              </>
            ) : (
              <>
                <p>
                  点击词条后按 Ctrl+V 粘贴图片，或拖入图片、选择文件。
                  {localSaving
                    ? "本地自动保存已开启：图片写入 public/images，词条写入 public/data，同时保留浏览器草稿。"
                    : "当前仅保存浏览器草稿，不会写入电脑文件夹。请导出 ZIP 后导入项目，或用 npm run dev:edit 启动本地自动保存页面。"}
                </p>
                <div className="checks">
                  <label>
                    <input
                      type="checkbox"
                      checked={c.compress}
                      onChange={(e) => set({ compress: e.target.checked })}
                    />
                    转换 WebP，最长边 1600px
                  </label>
                  <label>
                    压缩质量
                    <input
                      type="range"
                      min="0.4"
                      max="1"
                      step="0.01"
                      value={c.quality}
                      onChange={(e) => set({ quality: +e.target.value })}
                    />
                    {c.quality}
                  </label>
                </div>
                <button onClick={download} disabled={!drafts.length}>
                  导出本次修改
                </button>
                <button
                  onClick={async () => {
                    if (
                      window.confirm(
                        "清除本浏览器所有词汇与图片草稿？请先导出。",
                      )
                    ) {
                      await clearDrafts();
                      setDrafts([]);
                    }
                  }}
                >
                  清除草稿
                </button>
              </>
            )}
          </section>
        )}
        {query ? (
          <section className="search-results">
            <h2>搜索结果 · {results.length}</h2>
            {results.map(({ l, w }) => (
              <button
                key={w.id}
                onClick={() => {
                  setPosition(
                    l.id,
                    l.items.findIndex((x) => x.id === w.id),
                  );
                  navigate(`/list/${l.id}`);
                  setQuery("");
                }}
              >
                <strong>{w.word}</strong> {w.meaning}
                <small>{l.title}</small>
              </button>
            ))}
          </section>
        ) : (
          <div
            className="cards"
            onWheel={() => {
              if (c.pauseFollow && status === "playing") setFollowing(false);
            }}
            onTouchMove={() => {
              if (c.pauseFollow && status === "playing") setFollowing(false);
            }}
          >
            {merged.map((w, n) => (
              <article
                key={w.id}
                ref={(el) => {
                  refs.current[w.id] = el;
                }}
                className={`card mode-${c.mode} ${index === n ? "current" : ""} ${selected === w.id ? "editing-selected" : ""}`}
                onClick={() => {
                  setSelected(w.id);
                  if (!editing && index !== n) {
                    setPosition(listId, n);
                    if (player.current?.status !== "stopped") play(n);
                  }
                }}
              >
                <div className="card-top">
                  <span>{String(n + 1).padStart(2, "0")}</span>
                  <span>
                    {index === n && status === "playing"
                      ? "正在朗读"
                      : w.partOfSpeech}
                  </span>
                  <button
                    aria-label={`朗读 ${w.word}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      play(n);
                    }}
                  >
                    <Volume2 size={18} />
                  </button>
                </div>
                <div className="card-body">
                  {c.mode !== "image" && (
                    <div className="word-content">
                      {c.visible.includes("word") && (
                        <>
                          <h2>
                            {w.word}
                            <em>{w.partOfSpeech}</em>
                          </h2>
                          <div className="ipa">
                            UK {w.ipa.uk} <span>US {w.ipa.us}</span>
                          </div>
                        </>
                      )}
                      {c.visible
                        .filter((f) => f !== "word")
                        .map((f) => renderField(w, f))}
                      {w.notes && <p className="notes">笔记：{w.notes}</p>}
                      {editing && (
                        <details>
                          <summary>编辑词汇与笔记</summary>
                          {fields.map((f) => (
                            <label key={f}>
                              {labels[f]}
                              <textarea
                                value={fieldText(w, f)}
                                onChange={(e) => {
                                  if (f === "word" || f === "meaning")
                                    void update({ ...w, [f]: e.target.value });
                                  else {
                                    const [a, b] = f.split(".") as [
                                      "example" | "collocation",
                                      "en" | "zh",
                                    ];
                                    void update({
                                      ...w,
                                      [a]: { ...w[a], [b]: e.target.value },
                                    });
                                  }
                                }}
                              />
                            </label>
                          ))}
                          <label>
                            词性
                            <input
                              value={w.partOfSpeech}
                              onChange={(e) =>
                                void update({
                                  ...w,
                                  partOfSpeech: e.target.value,
                                })
                              }
                            />
                          </label>
                          {(["uk", "us"] as const).map((k) => (
                            <label key={k}>
                              {k} 音标
                              <input
                                value={w.ipa[k]}
                                onChange={(e) =>
                                  void update({
                                    ...w,
                                    ipa: { ...w.ipa, [k]: e.target.value },
                                  })
                                }
                              />
                            </label>
                          ))}
                          <label>
                            标签（逗号分隔）
                            <input
                              value={w.tags.join(",")}
                              onChange={(e) =>
                                void update({
                                  ...w,
                                  tags: e.target.value.split(","),
                                })
                              }
                            />
                          </label>
                          <label>
                            笔记
                            <textarea
                              value={w.notes}
                              onChange={(e) =>
                                void update({ ...w, notes: e.target.value })
                              }
                            />
                          </label>
                        </details>
                      )}
                    </div>
                  )}
                  {c.mode !== "text" && (
                    <div
                      className="image-area"
                      onDragOver={(e) => {
                        if (editing) e.preventDefault();
                      }}
                      onDrop={(e) => {
                        if (editing) {
                          e.preventDefault();
                          void add(w, Array.from(e.dataTransfer.files));
                        }
                      }}
                    >
                      {w.images.length ? (
                        w.images.map((pic, i) => (
                          <div key={pic.id} className="picture-wrap">
                            <div
                              className="picture"
                              onClick={() => {
                                if (c.reveal)
                                  setRevealed((s) => new Set(s).add(w.id));
                              }}
                            >
                              <PictureView
                                picture={pic}
                                onOpen={() => setLightbox(pic)}
                              />
                              {c.mode === "image" &&
                                (!c.reveal || revealed.has(w.id)) && (
                                  <div
                                    className={`overlay ${c.overlayPosition}`}
                                    style={{
                                      color: c.overlayColor,
                                      fontSize: c.overlaySize,
                                      background: `rgba(0,0,0,${c.overlayBackground})`,
                                    }}
                                  >
                                    {c.overlay.map((f) => (
                                      <div key={f}>{fieldText(w, f)}</div>
                                    ))}
                                  </div>
                                )}
                              {c.mode === "image" &&
                                c.reveal &&
                                !revealed.has(w.id) && (
                                  <button className="reveal">
                                    点击揭示答案
                                  </button>
                                )}
                              <button
                                className="expand"
                                aria-label="查看大图"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setLightbox(pic);
                                }}
                              >
                                <Maximize2 size={16} />
                              </button>
                            </div>
                            {editing && (
                              <div className="image-controls">
                                <label>
                                  图片窗口比例
                                  <select
                                    value={
                                      pic.heightMode === "fixed"
                                        ? "fixed"
                                        : (pic.aspectRatio ?? "original")
                                    }
                                    onChange={(e) =>
                                      void update({
                                        ...w,
                                        images: w.images.map((p) =>
                                          p.id === pic.id
                                            ? {
                                                ...p,
                                                heightMode:
                                                  e.target.value === "fixed"
                                                    ? "fixed"
                                                    : "auto",
                                                aspectRatio:
                                                  e.target.value === "fixed"
                                                    ? "original"
                                                    : (e.target
                                                        .value as Picture["aspectRatio"]),
                                              }
                                            : p,
                                        ),
                                      })
                                    }
                                  >
                                    <option value="original">
                                      原图比例（自适应）
                                    </option>
                                    <option value="4/3">4:3</option>
                                    <option value="1/1">1:1</option>
                                    <option value="16/9">16:9</option>
                                    <option value="fixed">
                                      自定义固定高度
                                    </option>
                                  </select>
                                </label>
                                <label>
                                  宽度 {pic.widthPercent}%
                                  <input
                                    type="range"
                                    min="20"
                                    max="100"
                                    value={pic.widthPercent}
                                    onChange={(e) =>
                                      void update({
                                        ...w,
                                        images: w.images.map((p) =>
                                          p.id === pic.id
                                            ? {
                                                ...p,
                                                widthPercent: +e.target.value,
                                              }
                                            : p,
                                        ),
                                      })
                                    }
                                  />
                                </label>
                                <label>
                                  高度
                                  <input
                                    type="number"
                                    min="120"
                                    max="900"
                                    value={pic.height ?? 300}
                                    disabled={pic.heightMode !== "fixed"}
                                    onChange={(e) =>
                                      void update({
                                        ...w,
                                        images: w.images.map((p) =>
                                          p.id === pic.id
                                            ? {
                                                ...p,
                                                height: Math.max(
                                                  120,
                                                  Math.min(
                                                    900,
                                                    +e.target.value,
                                                  ),
                                                ),
                                              }
                                            : p,
                                        ),
                                      })
                                    }
                                  />
                                </label>
                                <label>
                                  缩放
                                  <input
                                    type="range"
                                    min="0.5"
                                    max="3"
                                    step="0.1"
                                    value={pic.zoom ?? 1}
                                    onChange={(e) =>
                                      void update({
                                        ...w,
                                        images: w.images.map((p) =>
                                          p.id === pic.id
                                            ? { ...p, zoom: +e.target.value }
                                            : p,
                                        ),
                                      })
                                    }
                                  />
                                </label>
                                <label>
                                  旋转
                                  <input
                                    type="range"
                                    min="-180"
                                    max="180"
                                    value={pic.rotation}
                                    onChange={(e) =>
                                      void update({
                                        ...w,
                                        images: w.images.map((p) =>
                                          p.id === pic.id
                                            ? {
                                                ...p,
                                                rotation: +e.target.value,
                                              }
                                            : p,
                                        ),
                                      })
                                    }
                                  />
                                </label>
                                <select
                                  aria-label="图片填充"
                                  value={pic.objectFit}
                                  onChange={(e) =>
                                    void update({
                                      ...w,
                                      images: w.images.map((p) =>
                                        p.id === pic.id
                                          ? {
                                              ...p,
                                              objectFit: e.target.value as
                                                "cover" | "contain",
                                            }
                                          : p,
                                      ),
                                    })
                                  }
                                >
                                  <option value="contain">完整显示</option>
                                  <option value="cover">铺满裁切</option>
                                </select>
                                <select
                                  aria-label="图片位置"
                                  value={pic.objectPosition}
                                  onChange={(e) =>
                                    void update({
                                      ...w,
                                      images: w.images.map((p) =>
                                        p.id === pic.id
                                          ? {
                                              ...p,
                                              objectPosition: e.target.value,
                                            }
                                          : p,
                                      ),
                                    })
                                  }
                                >
                                  {[
                                    "center",
                                    "top",
                                    "bottom",
                                    "left",
                                    "right",
                                  ].map((p) => (
                                    <option key={p}>{p}</option>
                                  ))}
                                </select>
                                <input
                                  aria-label="图片描述"
                                  value={pic.alt}
                                  onChange={(e) =>
                                    void update({
                                      ...w,
                                      images: w.images.map((p) =>
                                        p.id === pic.id
                                          ? { ...p, alt: e.target.value }
                                          : p,
                                      ),
                                    })
                                  }
                                />
                                <button
                                  disabled={i === 0}
                                  onClick={() => {
                                    const imgs = [...w.images];
                                    [imgs[i - 1], imgs[i]] = [
                                      imgs[i],
                                      imgs[i - 1],
                                    ];
                                    void update({ ...w, images: imgs });
                                  }}
                                >
                                  前移
                                </button>
                                <button
                                  disabled={i === w.images.length - 1}
                                  onClick={() => {
                                    const imgs = [...w.images];
                                    [imgs[i + 1], imgs[i]] = [
                                      imgs[i],
                                      imgs[i + 1],
                                    ];
                                    void update({ ...w, images: imgs });
                                  }}
                                >
                                  后移
                                </button>
                                <button
                                  onClick={() =>
                                    void update({
                                      ...w,
                                      images: [
                                        pic,
                                        ...w.images.filter(
                                          (p) => p.id !== pic.id,
                                        ),
                                      ],
                                    })
                                  }
                                >
                                  设为默认
                                </button>
                                <label className="file-button">
                                  更换
                                  <input
                                    type="file"
                                    accept="image/png,image/jpeg,image/webp"
                                    onChange={async (e) => {
                                      const f = e.target.files?.[0];
                                      if (f) {
                                        try {
                                          const blob = await prepareImage(
                                            f,
                                            c.compress,
                                            c.quality,
                                          );
                                          const src = `images/${listId}/${w.id}-${crypto.randomUUID()}.${blob.type === "image/webp" ? "webp" : blob.type === "image/png" ? "png" : "jpg"}`;
                                          await storeImage(src, blob);
                                          await deleteImage(pic.src);
                                          await update({
                                            ...w,
                                            images: w.images.map((p) =>
                                              p.id === pic.id
                                                ? { ...p, src }
                                                : p,
                                            ),
                                          });
                                        } catch (e) {
                                          setError(String(e));
                                        }
                                      }
                                    }}
                                  />
                                </label>
                                <button
                                  aria-label="删除图片"
                                  onClick={async () => {
                                    await deleteImage(pic.src);
                                    await update({
                                      ...w,
                                      images: w.images.filter(
                                        (p) => p.id !== pic.id,
                                      ),
                                    });
                                  }}
                                >
                                  <Trash2 size={16} />
                                </button>
                              </div>
                            )}
                          </div>
                        ))
                      ) : (
                        <div className="empty-image">
                          <div className="empty-icon">
                            <ImagePlus size={28} />
                          </div>
                          <span>为这个词条添加一幅画面</span>
                          <small>
                            {editing
                              ? "拖拽图片到此处，或选中卡片后粘贴"
                              : "开启图片编辑，建立你的视觉记忆"}
                          </small>
                          {c.mode === "image" && (
                            <button
                              onClick={() =>
                                setRevealed((s) => new Set(s).add(w.id))
                              }
                            >
                              揭示答案
                            </button>
                          )}
                          {c.mode === "image" && revealed.has(w.id) && (
                            <p>
                              {w.word} · {w.meaning}
                              <br />
                              {w.example.en}
                            </p>
                          )}
                        </div>
                      )}
                      {editing && w.images.length === 0 && (
                        <label className="file-button add-image">
                          <ImagePlus size={16} /> 添加图片
                          <input
                            type="file"
                            accept="image/png,image/jpeg,image/webp"
                            onChange={(e) => {
                              void add(w, Array.from(e.target.files ?? []));
                              e.target.value = "";
                            }}
                          />
                        </label>
                      )}
                    </div>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
        {!controlsVisible && compactScreen && (
          <button
            className="restore-controls"
            aria-label="显示播放控制"
            onClick={showControls}
          >
            <Settings2 size={18} />
          </button>
        )}
        <div
          className="player-bar"
          hidden={compactScreen && !controlsVisible}
          onPointerDown={() => setControlsActivity((n) => n + 1)}
          onFocusCapture={() => setControlsActivity((n) => n + 1)}
        >
          <div className="player-word">
            <span className="sound-icon">
              <Volume2 size={19} />
            </span>
            <div>
              <strong>{current?.word ?? "准备学习"}</strong>
              <small>
                {list?.title} · {index + 1} / {merged.length}
              </small>
              <small role="status" aria-live="polite">
                {status === "playing"
                  ? "正在播放"
                  : status === "paused"
                    ? "已暂停，可继续"
                    : "已停止"}
              </small>
            </div>
          </div>
          <div className="player-buttons">
            <button aria-label="从第一条播放" onClick={() => play(0)}>
              起点
            </button>
            <button aria-label="上一条" onClick={() => jump(index - 1)}>
              <SkipBack size={20} />
            </button>
            <button
              className="play-button"
              aria-label={
                status === "playing"
                  ? "暂停"
                  : status === "paused"
                    ? "恢复播放"
                    : "播放"
              }
              onClick={toggle}
            >
              {status === "playing" ? <Pause size={22} /> : <Play size={22} />}
            </button>
            <button aria-label="下一条" onClick={() => jump(index + 1)}>
              <SkipForward size={20} />
            </button>
            <button
              aria-label="停止"
              title="结束朗读并回到第 1 条"
              onClick={stopPlayback}
            >
              <Square size={17} />
            </button>
          </div>
          <button className="player-config" onClick={() => setPanel("speech")}>
            {c.rate}× <Settings2 size={18} />
          </button>
          {compactScreen && status === "playing" && (
            <button
              className="hide-controls"
              aria-label="隐藏播放控制"
              onClick={() => setControlsVisible(false)}
            >
              <X size={18} />
            </button>
          )}
        </div>
      </main>
      {lightbox && (
        <div
          className="lightbox"
          role="dialog"
          aria-modal="true"
          aria-label="图片大图"
          onClick={() => setLightbox(undefined)}
        >
          <div
            className="lightbox-toolbar"
            onClick={(e) => e.stopPropagation()}
          >
            <span>查看图片</span>
            <button onClick={() => setImageZoomed(!imageZoomed)}>
              {imageZoomed ? "适应屏幕" : "放大细节"}
            </button>
            <button
              aria-label="关闭大图"
              onClick={() => setLightbox(undefined)}
            >
              <X />
            </button>
          </div>
          <div
            className={imageZoomed ? "lightbox-stage zoomed" : "lightbox-stage"}
            onClick={(e) => e.stopPropagation()}
          >
            <PictureView
              picture={{
                ...lightbox,
                heightMode: "auto",
                aspectRatio: "original",
                widthPercent: 100,
                objectFit: "contain",
                zoom: 1,
                rotation: 0,
              }}
              onOpen={() => {}}
            />
          </div>
          <div className="lightbox-caption">
            {imageZoomed ? "滑动查看画面细节" : "完整显示原图 · 可放大查看细节"}
          </div>
        </div>
      )}
    </div>
  );
}
export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Reader />} />
      <Route path="/list/:listId" element={<Reader />} />
      <Route path="*" element={<Reader />} />
    </Routes>
  );
}
