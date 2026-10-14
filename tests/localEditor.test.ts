import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { createServer, type ViteDevServer } from "vite";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { localEditor } from "../scripts/localEditor";
let server: ViteDevServer, root: string, base: string, token: string;
const original = {
  id: "v000001",
  sourceKey: "source",
  word: "abstain",
  meaning: "戒酒",
  partOfSpeech: "v.",
  ipa: { uk: "", us: "" },
  collocation: { en: "", zh: "" },
  example: { en: "", zh: "" },
  images: [],
  notes: "",
  tags: [],
};
beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "toeic-local-editor-"));
  await mkdir(join(root, "public/data"), { recursive: true });
  await writeFile(
    join(root, "public/data/list01.json"),
    JSON.stringify({ id: "list01", items: [original] }),
  );
  server = await createServer({
    root,
    configFile: false,
    plugins: [localEditor(root)],
    logLevel: "silent",
    optimizeDeps: { noDiscovery: true },
    server: { host: "127.0.0.1", port: 0 },
  });
  await server.listen();
  const addr = server.httpServer!.address() as { port: number };
  base = `http://127.0.0.1:${addr.port}`;
  token = (await (await fetch(base + "/__local-edit")).json()).token;
});
afterAll(async () => {
  await server?.close();
  if (
    root &&
    resolve(root).startsWith(resolve(tmpdir(), "toeic-local-editor-"))
  )
    await rm(root, { recursive: true, force: true });
});
function post(path: string, body: BodyInit, origin = base, auth = token) {
  return fetch(base + "/__local-edit/" + path, {
    method: "POST",
    headers: { Origin: origin, "X-Editor-Token": auth },
    body,
  });
}
describe("local editing API", () => {
  it("deletes the removed image file along with its JSON association", async () => {
    const src = "images/list01/v000001-delete.png",
      bytes = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    expect((await post("image?src=" + src, bytes)).status).toBe(200);
    expect(
      (
        await post(
          "word",
          JSON.stringify({
            listId: "list01",
            word: { ...original, images: [{ id: "delete", src }] },
          }),
        )
      ).status,
    ).toBe(200);
    expect(
      (await post("word", JSON.stringify({ listId: "list01", word: original })))
        .status,
    ).toBe(200);
    await expect(readFile(join(root, "public", src))).rejects.toMatchObject({
      code: "ENOENT",
    });
    const list = JSON.parse(
      await readFile(join(root, "public/data/list01.json"), "utf8"),
    );
    expect(list.items[0].images).toEqual([]);
  });
  it("preserves an image still referenced by another list", async () => {
    const src = "images/list01/v000001-shared.png",
      bytes = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    await post("image?src=" + src, bytes);
    await post(
      "word",
      JSON.stringify({
        listId: "list01",
        word: { ...original, images: [{ id: "shared", src }] },
      }),
    );
    await writeFile(
      join(root, "public/data/list02.json"),
      JSON.stringify({
        id: "list02",
        items: [
          { ...original, id: "v000051", images: [{ id: "shared", src }] },
        ],
      }),
    );
    expect(
      (await post("word", JSON.stringify({ listId: "list01", word: original })))
        .status,
    ).toBe(200);
    expect(await readFile(join(root, "public", src))).toEqual(bytes);
  });
  it("rejects foreign origins and missing authorization", async () => {
    expect((await post("word", "{}", "https://example.com")).status).toBe(403);
    expect((await post("word", "{}", base, "")).status).toBe(403);
  });
  it("rejects traversal and invalid image content", async () => {
    expect((await post("image?src=../../outside.png", "bad")).status).toBe(400);
    expect(
      (await post("image?src=images/list01/v000001-bad.png", "not an image"))
        .status,
    ).toBe(400);
  });
  it("writes image files and associates the stable word ID in JSON", async () => {
    const bytes = Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
        "base64",
      ),
      src = "images/list01/v000001-test.png";
    expect((await post("image?src=" + src, bytes)).status).toBe(200);
    const word = {
      ...original,
      notes: "saved on disk",
      images: [{ id: "test", src }],
    };
    expect(
      (await post("word", JSON.stringify({ listId: "list01", word }))).status,
    ).toBe(200);
    expect(await readFile(join(root, "public", src))).toEqual(bytes);
    const list = JSON.parse(
      await readFile(join(root, "public/data/list01.json"), "utf8"),
    );
    expect(list.items[0].images[0].src).toBe(src);
    expect(list.items[0].notes).toBe("saved on disk");
  });
  it("rejects unknown IDs and cross-word image references", async () => {
    expect(
      (
        await post(
          "word",
          JSON.stringify({
            listId: "list01",
            word: { ...original, id: "v999999" },
          }),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await post(
          "word",
          JSON.stringify({
            listId: "list01",
            word: {
              ...original,
              images: [{ src: "images/list01/v000002.png" }],
            },
          }),
        )
      ).status,
    ).toBe(400);
  });
});
