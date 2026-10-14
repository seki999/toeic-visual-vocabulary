import { imageBlob } from "./drafts";
import type { Word } from "./types";
let token = "";
const uploaded = new Set<string>();
let queue = Promise.resolve();
export async function connectLocalEditor() {
  if (!import.meta.env.DEV || import.meta.env.MODE !== "edit") return false;
  const response = await fetch("/__local-edit");
  if (!response.ok) throw Error("本地编辑服务未启动");
  token = (await response.json()).token;
  return true;
}
export function saveLocalWord(listId: string, word: Word) {
  const save = async () => {
    if (!token) throw Error("本地编辑服务尚未连接");
    const headers = { "X-Editor-Token": token };
    for (const image of word.images) {
      if (uploaded.has(image.src)) continue;
      const blob = await imageBlob(image.src);
      if (!blob) continue;
      const response = await fetch(
        `/__local-edit/image?src=${encodeURIComponent(image.src)}`,
        { method: "POST", headers, body: blob },
      );
      if (!response.ok) throw Error((await response.json()).error);
      uploaded.add(image.src);
    }
    const response = await fetch("/__local-edit/word", {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ listId, word }),
    });
    if (!response.ok) throw Error((await response.json()).error);
  };
  const task = queue.then(save);
  queue = task.catch(() => {});
  return task;
}
