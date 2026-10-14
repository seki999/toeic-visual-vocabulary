import { openDB } from "idb";
import JSZip from "jszip";
import { type List, type Word } from "./types";
const db = () =>
  openDB("toeic-drafts", 1, {
    upgrade(db) {
      db.createObjectStore("words");
      db.createObjectStore("images");
      db.createObjectStore("deleted");
    },
  });
export async function saveWord(w: Word) {
  const d = await db();
  await d.put("words", w, w.id);
}
export async function loadWords() {
  return (await db()).getAll("words") as Promise<Word[]>;
}
export async function imageBlob(src: string) {
  return (await db()).get("images", src) as Promise<Blob | undefined>;
}
export async function storeImage(src: string, blob: Blob) {
  await (await db()).put("images", blob, src);
}
export async function deleteImage(src: string) {
  const d = await db();
  await d.put("deleted", true, src);
  await d.delete("images", src);
}
export async function clearDrafts() {
  const d = await db();
  await Promise.all(["words", "images", "deleted"].map((s) => d.clear(s)));
}
export async function exportDrafts(lists: List[]) {
  const d = await db(),
    zip = new JSZip();
  const changes = await loadWords(),
    map = new Map(changes.map((w) => [w.id, w]));
  for (const list of lists) {
    if (!list.items.some((w) => map.has(w.id))) continue;
    zip.file(
      `public/data/${list.id}.json`,
      JSON.stringify(
        { ...list, items: list.items.map((w) => map.get(w.id) ?? w) },
        null,
        2,
      ),
    );
  }
  const used = new Set(
    lists.flatMap((l) =>
      l.items.flatMap((w) => (map.get(w.id) ?? w).images.map((i) => i.src)),
    ),
  );
  for (const src of await d.getAllKeys("images")) {
    if (used.has(String(src)))
      zip.file(`public/${src}`, await d.get("images", src));
  }
  zip.file(
    "deleted-files.json",
    JSON.stringify(
      (await d.getAllKeys("deleted"))
        .filter((k) => !used.has(String(k)))
        .map((k) => `public/${k}`),
      null,
      2,
    ),
  );
  return zip.generateAsync({ type: "blob" });
}
export async function prepareImage(
  file: File,
  compress: boolean,
  quality: number,
) {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
    throw Error("请选择 JPG、PNG 或 WebP 图片");
  if (file.size > 25 * 1024 * 1024) throw Error("图片不能超过 25 MB");
  if (!compress) return file;
  const bitmap = await createImageBitmap(file, {
    imageOrientation: "from-image",
  });
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(Error("图片压缩失败，原文件未保存"))),
      "image/webp",
      quality,
    ),
  );
}
