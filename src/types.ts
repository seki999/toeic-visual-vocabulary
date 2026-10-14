export type Field =
  | "word"
  | "meaning"
  | "collocation.en"
  | "collocation.zh"
  | "example.en"
  | "example.zh";
export const fields: Field[] = [
  "word",
  "meaning",
  "collocation.en",
  "collocation.zh",
  "example.en",
  "example.zh",
];
export const labels: Record<Field, string> = {
  word: "英语单词",
  meaning: "中文释义",
  "collocation.en": "英语搭配",
  "collocation.zh": "搭配中文",
  "example.en": "英语例句",
  "example.zh": "中文例句",
};
export interface Picture {
  id: string;
  src: string;
  alt: string;
  widthPercent: number;
  height: number;
  heightMode?: "auto" | "fixed";
  aspectRatio?: "original" | "4/3" | "1/1" | "16/9";
  objectFit: "contain" | "cover";
  objectPosition: string;
  rotation: number;
  zoom: number;
}
export interface Word {
  id: string;
  sourceKey: string;
  word: string;
  partOfSpeech: string;
  ipa: { uk: string; us: string };
  meaning: string;
  collocation: { en: string; zh: string };
  example: { en: string; zh: string };
  images: Picture[];
  notes: string;
  tags: string[];
}
export interface List {
  id: string;
  title: string;
  description: string;
  items: Word[];
}
export interface Manifest {
  total: number;
  lists: { id: string; title: string; count: number; file: string }[];
}
export function fieldText(w: Word, f: Field): string {
  if (f === "word" || f === "meaning") return w[f];
  const [a, b] = f.split(".") as ["collocation" | "example", "en" | "zh"];
  return w[a][b];
}
export function language(f: Field) {
  return f === "meaning" || f.endsWith(".zh") ? "zh-CN" : "en-US";
}
export function asset(path: string, base = import.meta.env.BASE_URL) {
  return base + path.replace(/^\/+/, "");
}
