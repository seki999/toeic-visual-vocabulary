import type { Plugin } from "vite";
import { randomBytes } from "node:crypto";
import {
  readFile,
  writeFile,
  rename,
  mkdir,
  realpath,
  readdir,
  unlink,
} from "node:fs/promises";
import { resolve, dirname, sep, relative } from "node:path";
import type { IncomingMessage } from "node:http";
import type { Word } from "../src/types";
async function body(req: IncomingMessage, limit: number) {
  let size = 0;
  const parts: Buffer[] = [];
  for await (const part of req) {
    size += part.length;
    if (size > limit) throw Error("文件超过大小限制");
    parts.push(Buffer.from(part));
  }
  return Buffer.concat(parts);
}
export function validImagePath(src: string) {
  return /^images\/list\d{2,}\/v\d{6,}(?:-[a-zA-Z0-9-]+)?\.(png|jpg|jpeg|webp)$/.test(
    src,
  );
}
export function validImageBytes(bytes: Buffer, src: string) {
  if (src.endsWith(".png"))
    return bytes
      .subarray(0, 8)
      .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (/\.jpe?g$/.test(src))
    return bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  return (
    bytes.subarray(0, 4).toString() === "RIFF" &&
    bytes.subarray(8, 12).toString() === "WEBP"
  );
}
export function localEditor(root = process.cwd()): Plugin {
  const token = randomBytes(32).toString("hex");
  let queue = Promise.resolve();
  async function safeTarget(path: string) {
    const projectRoot = await realpath(root);
    const publicRoot = await realpath(resolve(root, "public"));
    if (!publicRoot.startsWith(projectRoot + sep))
      throw Error("禁止公共目录链接");
    const target = resolve(publicRoot, path);
    if (!target.startsWith(publicRoot + sep)) throw Error("禁止的文件路径");
    let directory = publicRoot;
    for (const part of relative(publicRoot, dirname(target))
      .split(sep)
      .filter(Boolean)) {
      directory = resolve(directory, part);
      try {
        const existing = await realpath(directory);
        if (!existing.startsWith(publicRoot + sep)) throw Error("禁止目录链接");
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
        await mkdir(directory);
      }
    }
    const parent = await realpath(dirname(target));
    if (!parent.startsWith(publicRoot + sep)) throw Error("禁止目录链接");
    try {
      const actual = await realpath(target);
      if (!actual.startsWith(publicRoot + sep)) throw Error("禁止文件链接");
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    }
    return target;
  }
  async function atomic(path: string, data: Buffer | string) {
    const target = await safeTarget(path),
      temp = target + "." + randomBytes(6).toString("hex") + ".tmp";
    await writeFile(temp, data);
    await rename(temp, target);
  }
  return {
    name: "local-vocabulary-editor",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith("/__local-edit")) return next();
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.setHeader("Cache-Control", "no-store");
        const host = req.headers.host ?? "",
          origin = req.headers.origin;
        if (
          !/^(127\.0\.0\.1|localhost):\d+$/.test(host) ||
          (origin && origin !== `http://${host}`)
        ) {
          res.statusCode = 403;
          res.end(JSON.stringify({ error: "仅允许本机同源编辑" }));
          return;
        }
        const url = new URL(req.url, `http://${host}`);
        if (req.method === "GET" && url.pathname === "/__local-edit") {
          res.end(JSON.stringify({ token }));
          return;
        }
        if (
          req.method !== "POST" ||
          origin !== `http://${host}` ||
          req.headers["x-editor-token"] !== token
        ) {
          res.statusCode = 403;
          res.end(JSON.stringify({ error: "编辑请求验证失败" }));
          return;
        }
        try {
          if (url.pathname === "/__local-edit/image") {
            const src = url.searchParams.get("src") ?? "";
            if (!validImagePath(src)) throw Error("图片路径无效");
            const bytes = await body(req, 25 * 1024 * 1024);
            if (!validImageBytes(bytes, src)) throw Error("图片格式不符");
            await atomic(src, bytes);
          } else if (url.pathname === "/__local-edit/word") {
            const { listId, word } = JSON.parse(
              (await body(req, 1024 * 1024)).toString(),
            ) as { listId: string; word: Word };
            if (
              !/^list\d{2,}$/.test(listId) ||
              !/^v\d{6,}$/.test(word?.id) ||
              typeof word.word !== "string" ||
              !Array.isArray(word.images)
            )
              throw Error("词条数据无效");
            for (const image of word.images) {
              if (
                !validImagePath(image.src) ||
                !new RegExp(`^images/${listId}/${word.id}(?:-|\\.)`).test(
                  image.src,
                )
              )
                throw Error("图片与词条 ID 不匹配");
              await readFile(await safeTarget(image.src));
            }
            const write = async () => {
              const path = `data/${listId}.json`,
                file = await safeTarget(path);
              const list = JSON.parse(await readFile(file, "utf8"));
              const index = list.items.findIndex((w: Word) => w.id === word.id);
              if (index < 0 || list.items[index].sourceKey !== word.sourceKey)
                throw Error("词条不存在或源标识不符");
              const kept = new Set(word.images.map((i) => i.src));
              const removed: string[] = [
                ...new Set(
                  (list.items[index].images ?? []).map(
                    (i: { src: string }) => i.src,
                  ),
                ),
              ].filter(
                (src): src is string =>
                  typeof src === "string" &&
                  !kept.has(src) &&
                  validImagePath(src) &&
                  new RegExp(`^images/${listId}/${word.id}(?:-|\\.)`).test(src),
              );
              list.items[index] = word;
              // Inspect every list before changing files, including shared references.
              const used = new Set<string>();
              const dataDirectory = await safeTarget(
                "data/" + listId + ".json",
              );
              for (const name of await readdir(dirname(dataDirectory))) {
                if (!/^list\d{2,}\.json$/.test(name)) continue;
                const data =
                  name === listId + ".json"
                    ? list
                    : JSON.parse(
                        await readFile(
                          await safeTarget("data/" + name),
                          "utf8",
                        ),
                      );
                for (const item of data.items)
                  for (const image of item.images ?? []) used.add(image.src);
              }
              await atomic(path, JSON.stringify(list, null, 2));
              for (const src of removed) {
                if (!used.has(src)) {
                  try {
                    await unlink(await safeTarget(src));
                  } catch (e) {
                    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
                  }
                }
              }
            };
            const task = queue.then(write);
            queue = task.catch(() => {});
            await task;
          } else {
            res.statusCode = 404;
            res.end(JSON.stringify({ error: "接口不存在" }));
            return;
          }
          res.end(JSON.stringify({ saved: true }));
        } catch (e) {
          res.statusCode = 400;
          res.end(
            JSON.stringify({
              error: e instanceof Error ? e.message : "本地保存失败",
            }),
          );
        }
      });
    },
  };
}
