import { test, expect } from "@playwright/test";
test("mobile and tablet images keep their original ratio and offer a usable viewer", async ({
  page,
}) => {
  for (const width of [390, 768]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    const image = page.locator(".card").first().locator(".picture img");
    await expect(image).toBeVisible();
    await expect
      .poll(() =>
        image.evaluate(
          (img: HTMLImageElement) => img.complete && img.naturalWidth > 0,
        ),
      )
      .toBe(true);
    const sizes = await image.evaluate((img: HTMLImageElement) => ({
      ratio: img.clientWidth / img.clientHeight,
      natural: img.naturalWidth / img.naturalHeight,
    }));
    expect(Math.abs(sizes.ratio - sizes.natural)).toBeLessThan(0.02);
    const card = page.locator(".card").first();
    const text = await card.locator(".word-content").boundingBox(),
      picture = await card.locator(".image-area").boundingBox();
    expect(picture!.y).toBeGreaterThanOrEqual(text!.y + text!.height - 1);
    await card.getByRole("button", { name: "查看大图" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.locator(".lightbox")).toHaveCSS(
      "background-color",
      "rgb(17, 26, 23)",
    );
    await page.getByRole("button", { name: "放大细节" }).click();
    await expect(page.locator(".lightbox-stage")).toHaveClass(/zoomed/);
    await page.getByRole("button", { name: "适应屏幕" }).click();
    await expect(page.locator(".lightbox-stage")).not.toHaveClass(/zoomed/);
    await page.screenshot({ path: `test-results/image-viewer-${width}.png` });
    await page.getByRole("button", { name: "关闭大图" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  }
});
test("playback focus, pause and rapid list cancellation", async ({ page }) => {
  await page.addInitScript(() => {
    let pending: SpeechSynthesisUtterance | undefined;
    (window as any).__finishSpeech = () =>
      pending?.onend?.({} as SpeechSynthesisEvent);
    Object.defineProperty(window, "speechSynthesis", {
      value: {
        getVoices: () => [],
        addEventListener: () => {},
        removeEventListener: () => {},
        cancel: () => {
          pending = undefined;
        },
        pause: () => {},
        resume: () => {},
        speak: (u: SpeechSynthesisUtterance) => {
          pending = u;
        },
      },
    });
  });
  await page.goto("/");
  await expect(page.locator(".card")).toHaveCount(50);
  await page.getByRole("button", { name: "朗读设置", exact: true }).click();
  await page.getByRole("button", { name: "只读单词", exact: true }).click();
  await page.getByLabel("字段间隔 (毫秒)").fill("0");
  await page.getByLabel("词条间隔 (毫秒)").fill("0");
  await page.getByRole("button", { name: "播放", exact: true }).click();
  await expect(page.locator(".card").first()).toContainText("正在朗读");
  await page.evaluate(() => (window as any).__finishSpeech());
  await expect(page.locator(".card").nth(1)).toContainText("正在朗读");
  await expect(page.locator(".progress strong")).toHaveText("02 / 50");
  await expect(page.locator(".player-word small").first()).toContainText(
    "2 / 50",
  );
  await page.getByRole("button", { name: "暂停", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "恢复播放", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "恢复播放", exact: true }).click();
  await page.getByRole("button", { name: "停止", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("已停止");
  await expect(page.locator(".progress strong")).toHaveText("01 / 50");
  await expect(page.locator(".player-word small").first()).toContainText(
    "1 / 50",
  );
  await expect(page.locator(".card").first()).toHaveClass(/current/);
  await expect(
    page.getByRole("button", { name: "恢复播放", exact: true }),
  ).toHaveCount(0);
  await page.evaluate(() => (window as any).__finishSpeech());
  await expect(page.getByRole("status")).toHaveText("已停止");
  await page.getByRole("button", { name: "播放", exact: true }).click();
  await expect(page.locator(".card").first()).toContainText("正在朗读");
  await page.getByRole("button", { name: "List 02", exact: false }).click();
  await expect(page.locator("h1")).toContainText("List 02");
  await page.evaluate(() => (window as any).__finishSpeech());
  await expect(
    page.getByRole("button", { name: "播放", exact: true }),
  ).toBeVisible();
});
test("selecting a word while stopped updates the saved learning position", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".card")).toHaveCount(50);
  await page.locator(".card").nth(4).locator("h2").click();
  await expect(page.locator(".progress strong")).toHaveText("05 / 50");
  await expect(page.locator(".card").nth(4)).toHaveClass(/current/);
  await expect(page.locator(".player-word small").first()).toContainText(
    "5 / 50",
  );
  await expect(page.getByRole("status")).toHaveText("已停止");
  await page.reload();
  await expect(page.locator(".progress strong")).toHaveText("05 / 50");
});
test("lists, modes, search and durable edits", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".card")).toHaveCount(50);
  await expect(page.locator(".word-content h2").first()).toContainText(
    "abstain",
  );
  await page.getByRole("button", { name: "List 02", exact: false }).click();
  await expect(page.locator("h1")).toContainText("List 02");
  await expect(page.locator(".card")).toHaveCount(50);
  await page.getByRole("button", { name: "纯文字", exact: true }).click();
  await expect(page.locator(".image-area")).toHaveCount(0);
  await page.getByRole("button", { name: "纯图片", exact: true }).click();
  await expect(page.locator(".word-content")).toHaveCount(0);
  await expect(page.locator(".image-area")).toHaveCount(50);
  await page.getByRole("button", { name: "图文", exact: true }).click();
  await page.getByRole("button", { name: "图片编辑", exact: true }).click();
  const first = page.locator(".card").first();
  await first.locator("summary").click();
  await first.getByLabel("笔记", { exact: true }).fill("刷新保留的学习笔记");
  await page.waitForTimeout(300);
  await page.reload();
  await expect(page.locator(".card").first()).toContainText(
    "刷新保留的学习笔记",
  );
  await page.getByRole("button", { name: "图片编辑", exact: true }).click();
  await page
    .locator(".card")
    .first()
    .locator("input[type=file]")
    .last()
    .setInputFiles({
      name: "sample.png",
      mimeType: "image/png",
      buffer: await page.screenshot(),
    });
  await expect(
    page.locator(".card").first().locator(".picture img"),
  ).toHaveCount(1);
  await page.reload();
  await expect(
    page.locator(".card").first().locator(".picture img"),
  ).toHaveCount(1);
  await page.getByRole("textbox", { name: "搜索词汇" }).fill("abstain");
  await expect(page.locator(".search-results button")).toHaveCount(2);
  await page.locator(".search-results button").first().click();
  await expect(page.locator("h1")).toContainText("List 01");
});
for (const [name, width, height] of [
  ["desktop", 1440, 1000],
  ["tablet", 768, 1024],
  ["mobile", 390, 844],
] as const) {
  test(`${name} layout fits viewport`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto("/");
    await expect(page.locator(".card")).toHaveCount(50);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `test-results/${name}.png`,
      fullPage: false,
    });
    if (width < 800) {
      await page.getByRole("button", { name: "切换列表菜单" }).click();
      await expect(page.locator(".sidebar")).toHaveClass(/open/);
      await page.getByRole("button", { name: "List 13", exact: false }).click();
      await expect(page.locator(".card")).toHaveCount(26);
    }
  });
}
