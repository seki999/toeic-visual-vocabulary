import { test, expect } from "@playwright/test";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import { localEditor } from "../../scripts/localEditor";
import { mkdtemp, cp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
test("local edit mode writes an added image and its word association to disk", async ({
  page,
}) => {
  test.setTimeout(60000);
  const root = await mkdtemp(join(tmpdir(), "toeic-browser-save-"));
  // The app loads manifest.json and every referenced list on startup.
  // Mirror all data in the temporary public directory to keep the fixture valid.
  await cp("public/data", join(root, "public/data"), { recursive: true });
  await cp("public/images", join(root, "public/images"), { recursive: true });
  const initial = JSON.parse(
    await readFile(join(root, "public/data/list01.json"), "utf8"),
  );
  // Keep this test independent of how many real vocabulary images exist.
  // Modify only the temporary fixture, never the repository data.
  const targetIndex = 0;
  initial.items[targetIndex].images = [];
  await writeFile(
    join(root, "public/data/list01.json"),
    JSON.stringify(initial, null, 2),
    "utf8",
  );
  const server = await createServer({
    root: process.cwd(),
    publicDir: join(root, "public"),
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
      .nth(targetIndex)
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
    const image = data.items[targetIndex].images.at(-1);
    expect(image.src).toMatch(
      new RegExp("^images/list01/" + initial.items[targetIndex].id + "-"),
    );
    const card = page.locator(".card").nth(targetIndex);
    await expect(card.locator(".add-image")).toHaveCount(0);
    await card.locator(".image-area").evaluate((el) => {
      const transfer = new DataTransfer();
      transfer.items.add(
        new File(["test"], "second.png", { type: "image/png" }),
      );
      el.dispatchEvent(
        new DragEvent("drop", { bubbles: true, dataTransfer: transfer }),
      );
    });
    await expect(page.getByRole("alert")).toContainText(
      "每个词条只能添加一张图片",
    );
    await expect(card.locator(".picture img")).toHaveCount(1);
    const bytes = await readFile(join(root, "public", image.src));
    expect(bytes.subarray(0, 4).toString()).toBe("RIFF");
    expect(bytes.length).toBeGreaterThan(100);
    await page
      .locator(".card")
      .nth(targetIndex)
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
      after.items[targetIndex].images.some(
        (i: { src: string }) => i.src === image.src,
      ),
    ).toBe(false);
    await expect(card.locator(".add-image")).toHaveCount(1);
  } finally {
    await server.close();
    if (resolve(root).startsWith(resolve(tmpdir(), "toeic-browser-save-")))
      await rm(root, { recursive: true, force: true });
  }
});
