import { test, expect } from "@playwright/test";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import { localEditor } from "../../scripts/localEditor";
import { mkdtemp, mkdir, copyFile, cp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
test("local edit mode writes an added image and its word association to disk", async ({
  page,
}) => {
  test.setTimeout(60000);
  const root = await mkdtemp(join(tmpdir(), "toeic-browser-save-"));
  await mkdir(join(root, "public/data"), { recursive: true });
  await copyFile(
    "public/data/list01.json",
    join(root, "public/data/list01.json"),
  );
  await cp("public/images", join(root, "public/images"), { recursive: true });
  const server = await createServer({
    root: process.cwd(),
    configFile: false,
    mode: "edit",
    cacheDir: join(root, "vite-cache"),
    plugins: [react(), localEditor(root)],
    logLevel: "silent",
    server: { host: "127.0.0.1", port: 0 },
  });
  try {
    await server.listen();
    const port = (server.httpServer!.address() as { port: number }).port;
    await page.goto(`http://127.0.0.1:${port}/`, {
      waitUntil: "domcontentloaded",
    });
    await expect(page.locator(".card")).toHaveCount(50);
    await expect(page.getByText(/本地自动保存已开启/)).toBeVisible();
    await page.getByRole("button", { name: "图片编辑", exact: true }).click();
    await page
      .locator(".card")
      .first()
      .locator("input[type=file]")
      .last()
      .setInputFiles({
        name: "test.png",
        mimeType: "image/png",
        buffer: await page.screenshot(),
      });
    await expect(page.getByText(/已保存到项目文件夹/)).toBeVisible();
    const data = JSON.parse(
      await readFile(join(root, "public/data/list01.json"), "utf8"),
    );
    const image = data.items[0].images.at(-1);
    expect(image.src).toMatch(/^images\/list01\/v000001-/);
    const bytes = await readFile(join(root, "public", image.src));
    expect(bytes.subarray(0, 4).toString()).toBe("RIFF");
    expect(bytes.length).toBeGreaterThan(100);
    await page
      .locator(".card")
      .first()
      .getByRole("button", { name: "删除图片", exact: true })
      .last()
      .click();
    await expect
      .poll(async () => {
        try {
          await readFile(join(root, "public", image.src));
          return true;
        } catch {
          return false;
        }
      })
      .toBe(false);
    const after = JSON.parse(
      await readFile(join(root, "public/data/list01.json"), "utf8"),
    );
    expect(
      after.items[0].images.some((i: { src: string }) => i.src === image.src),
    ).toBe(false);
  } finally {
    await server.close();
    if (resolve(root).startsWith(resolve(tmpdir(), "toeic-browser-save-")))
      await rm(root, { recursive: true, force: true });
  }
});
