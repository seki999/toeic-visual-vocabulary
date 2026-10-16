import { asset, type Word } from "../types";
import type { Story } from "./types";
export function safeStoryImage(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^images\/[a-zA-Z0-9_./-]+\.webp$/.test(value) &&
    !value.split("/").includes("..")
  );
}
export function validateStory(
  value: unknown,
  listId: string,
  words: Word[],
): Story {
  const errors: string[] = [];
  const v = value as any;
  const text = (x: unknown) => typeof x === "string" && x.trim().length > 0;
  const ids = new Set(words.map((w) => w.id));
  const targets = (a: any, path: string) => {
    if (
      !Array.isArray(a) ||
      a.some((x) => typeof x !== "string" || !ids.has(x))
    )
      errors.push(`${path}: invalid target IDs`);
    else if (new Set(a).size !== a.length)
      errors.push(`${path}: duplicate target IDs`);
  };
  if (!v || typeof v !== "object") throw Error("Story must be an object");
  if (
    v.schemaVersion !== 1 ||
    v.listId !== listId ||
    !text(v.id) ||
    !text(v.title) ||
    !text(v.titleZh)
  )
    errors.push("Invalid Story header");
  targets(v.targetWordIds, "targetWordIds");
  const characters = new Set<string>();
  if (!Array.isArray(v.characters) || !v.characters.length)
    errors.push("Missing characters");
  else
    for (const c of v.characters) {
      if (
        !c ||
        !text(c.id) ||
        !text(c.name) ||
        characters.has(c.id) ||
        !["male", "female", "neutral", undefined].includes(c.voiceGender) ||
        (c.preferredVoice != null && typeof c.preferredVoice !== "string")
      )
        errors.push("Invalid/duplicate character");
      else characters.add(c.id);
    }
  const scenes = new Set(),
    lines = new Set();
  if (!Array.isArray(v.scenes) || !v.scenes.length)
    errors.push("Missing scenes");
  else
    for (const s of v.scenes) {
      if (
        !s ||
        !text(s.id) ||
        scenes.has(s.id) ||
        !text(s.title) ||
        !text(s.titleZh)
      ) {
        errors.push("Invalid/duplicate scene");
        continue;
      }
      scenes.add(s.id);
      if (s.image != null && !safeStoryImage(s.image))
        errors.push("Invalid scene image path");
      if (!Array.isArray(s.lines) || !s.lines.length) {
        errors.push("Missing dialogue");
        continue;
      }
      for (const l of s.lines) {
        if (
          !l ||
          !text(l.id) ||
          lines.has(l.id) ||
          !characters.has(l.speakerId) ||
          !text(l.en) ||
          !text(l.zh)
        ) {
          errors.push("Invalid/duplicate line or speaker");
          continue;
        }
        lines.add(l.id);
        targets(l.targetWordIds, l.id);
        if (
          Array.isArray(l.targetWordIds) &&
          l.targetWordIds.some((id: string) => !v.targetWordIds?.includes(id))
        )
          errors.push("Line target outside story targets");
        if (l.image != null && !safeStoryImage(l.image))
          errors.push("Invalid line image path");
      }
    }
  if (errors.length) throw Error(errors.join("; "));
  return v as Story;
}
export async function loadStory(
  listId: string,
  words: Word[],
  signal?: AbortSignal,
): Promise<Story | null> {
  const manifest = await fetch(asset("stories/manifest.json"), { signal });
  if (
    manifest.status === 404 ||
    manifest.headers?.get("content-type")?.includes("text/html")
  )
    return null;
  if (!manifest.ok) throw Error("无法加载故事清单");
  const data = await manifest.json();
  if (!Array.isArray(data.listIds) || !data.listIds.includes(listId))
    return null;
  const response = await fetch(asset(`stories/${listId}.story.json`), {
    signal,
  });
  if (
    response.status === 404 ||
    response.headers?.get("content-type")?.includes("text/html")
  )
    return null;
  if (!response.ok) throw Error("无法加载故事");
  return validateStory(await response.json(), listId, words);
}
export function targetPattern(word: string) {
  const irregular: Record<string, string> = {
    gape: "gap(?:e|es|ed|ing)",
    spearhead: "spearhead(?:s|ed|ing)?",
    recuperate: "recuperat(?:e|es|ed|ing)",
    insinuate: "insinuat(?:e|es|ed|ing)",
    segregate: "segregat(?:e|es|ed|ing)",
    vindicate: "vindicat(?:e|es|ed|ing)",
    paparazzo: "paparazz(?:o|i)",
    premiere: "premier(?:e|es|ed|ing)",
    ornament: "ornament(?:s|ed|ing)?",
    abstain: "abstain(?:s|ed|ing)?",
    throng: "throng(?:s|ed|ing)?",
    ferment: "ferment(?:s|ed|ing)?",
    stampede: "stamped(?:e|es|ed|ing)",
    tarnish: "tarnish(?:es|ed|ing)?",
    plague: "plagu(?:e|es|ed|ing)",
    repent: "repent(?:s|ed|ing)?",
    counterfeit: "counterfeit(?:s|ed|ing)?",
  };
  return (
    irregular[word.toLowerCase()] ??
    Array.from(word)
      .map((char) => ("\\^$.*+?()[]{}|".includes(char) ? "\\" + char : char))
      .join("") + "(?:s)?"
  );
}
