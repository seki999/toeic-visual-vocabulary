import { test, expect } from "@playwright/test";
test("narrow portrait controls fit and can be hidden while reading text", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.addInitScript(() =>
    Object.defineProperty(window, "speechSynthesis", {
      value: {
        getVoices: () => [],
        addEventListener: () => {},
        removeEventListener: () => {},
        cancel: () => {},
        pause: () => {},
        resume: () => {},
        speak: () => {},
      },
    }),
  );
  await page.goto("/");
  await expect(page.locator(".card")).toHaveCount(50);
  await page.getByRole("button", { name: "纯文字", exact: true }).click();
  await page.getByRole("button", { name: "播放", exact: true }).click();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(320);
  for (const label of ["暂停", "下一条", "停止", "隐藏播放控制"]) {
    const box = await page
      .getByRole("button", { name: label, exact: true })
      .boundingBox();
    expect(box!.x + box!.width).toBeLessThanOrEqual(320);
  }
  await page.getByRole("button", { name: "隐藏播放控制" }).click();
  await expect(page.locator(".player-bar")).toBeHidden();
  await expect(page.locator("main")).toHaveCSS("height", "700px");
  await page.locator(".card.current h2").click();
  await expect(page.locator(".player-bar")).toBeVisible();
  await page.getByRole("button", { name: "停止", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("已停止");
});
test("landscape playback hides controls and gives the current image the available screen", async ({
  page,
}) => {
  await page.setViewportSize({ width: 800, height: 300 });
  await page.addInitScript(() =>
    Object.defineProperty(window, "speechSynthesis", {
      value: {
        getVoices: () => [],
        addEventListener: () => {},
        removeEventListener: () => {},
        cancel: () => {},
        pause: () => {},
        resume: () => {},
        speak: () => {},
      },
    }),
  );
  await page.goto("/");
  await expect(page.locator(".card")).toHaveCount(50);
  await page.getByRole("button", { name: "纯图片", exact: true }).click();
  await page.getByRole("button", { name: "播放", exact: true }).click();
  await expect(page.locator(".app")).toHaveClass(/image-focus/);
  await expect(page.locator(".card:visible")).toHaveCount(1);
  const image = page.locator(".card.current .picture img");
  await expect
    .poll(() =>
      image.evaluate(
        (img: HTMLImageElement) => img.complete && img.naturalWidth > 0,
      ),
    )
    .toBe(true);
  const withControls = await image.boundingBox();
  expect(withControls!.height).toBeGreaterThan(190);
  await expect(page.locator(".player-bar")).toBeHidden({ timeout: 7000 });
  const hidden = await image.boundingBox();
  expect(hidden!.height).toBeGreaterThan(270);
  expect(hidden!.y).toBeGreaterThanOrEqual(0);
  expect(hidden!.y + hidden!.height).toBeLessThanOrEqual(300);
  await page.screenshot({ path: "test-results/landscape-playback-hidden.png" });
  await image.click();
  await expect(page.locator(".player-bar")).toBeVisible();
  await expect(page.locator(".player-word small").first()).toContainText(
    "1 / 50",
  );
  await page.getByRole("button", { name: "隐藏播放控制" }).click();
  await expect(page.locator(".player-bar")).toBeHidden();
  await page.getByRole("button", { name: "显示播放控制" }).click();
  await expect(page.locator(".player-bar")).toBeVisible();
  await page.getByRole("button", { name: "暂停", exact: true }).click();
  await expect(page.locator(".player-bar")).toBeVisible();
  await page.getByRole("button", { name: "停止", exact: true }).click();
  await expect(page.locator(".app")).not.toHaveClass(/image-focus/);
  await expect(page.locator(".card:visible")).toHaveCount(50);
});
for (const [name, width, height] of [
  ["phone-text-landscape", 844, 390],
  ["phone-text-portrait", 390, 844],
  ["tablet-text", 1024, 768],
] as const) {
  test(`${name}: text scrolls above the player without being covered`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await page.goto("/");
    await expect(page.locator(".card")).toHaveCount(50);
    await page.getByRole("button", { name: "纯文字", exact: true }).click();
    const main = await page.locator("main").boundingBox(),
      bar = await page.locator(".player-bar").boundingBox();
    expect(main!.y + main!.height).toBeLessThanOrEqual(bar!.y);
    await expect(page.locator("main")).toHaveCSS("overflow-y", "auto");
    const last = page.locator(".card").first().locator(".field-example-zh");
    await last.evaluate((el) =>
      el.scrollIntoView({ block: "end", behavior: "instant" }),
    );
    const field = await last.boundingBox();
    expect(field!.y + field!.height).toBeLessThanOrEqual(bar!.y);
    await page.screenshot({ path: `test-results/${name}.png` });
  });
}
for (const [device, width, height] of [
  ["phone-landscape", 844, 390],
  ["tablet-landscape", 1024, 768],
  ["phone-short-landscape", 800, 300],
] as const) {
  test(`${device}: picture fits above compact playback controls`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await page.goto("/");
    await expect(page.locator(".card")).toHaveCount(50);
    await page.getByRole("button", { name: "纯图片", exact: true }).click();
    const card = page.locator(".card").first(),
      image = card.locator(".picture img");
    await expect
      .poll(() =>
        image.evaluate(
          (img: HTMLImageElement) => img.complete && img.naturalWidth > 0,
        ),
      )
      .toBe(true);
    await card.evaluate((el) =>
      el.scrollIntoView({ block: "center", behavior: "instant" }),
    );
    const rect = await image.boundingBox(),
      bar = await page.locator(".player-bar").boundingBox();
    expect(rect!.y).toBeGreaterThanOrEqual(0);
    expect(rect!.y + rect!.height).toBeLessThanOrEqual(bar!.y);
    expect(rect!.height).toBeLessThan(height - 120);
    if (height < 600) expect(bar!.height).toBeLessThanOrEqual(60);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
    await page.screenshot({ path: `test-results/${device}.png` });
    await page.getByRole("button", { name: "切换列表菜单" }).click();
    await expect(page.locator(".sidebar")).toHaveClass(/open/);
    await page.getByRole("button", { name: "List 02", exact: false }).click();
    await expect(page.locator("h1")).toContainText("List 02");
  });
}
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
test("lists, modes, search and read-only hosted controls", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".card")).toHaveCount(50);
  await expect(page.locator(".word-content h2").first()).toContainText("abstain");
  await page.getByRole("button", { name: "List 02", exact: false }).click();
  await expect(page.locator("h1")).toContainText("List 02");
  await expect(page.locator(".card")).toHaveCount(50);
  await page.getByRole("button", { name: "纯文字", exact: true }).click();
  await expect(page.locator(".image-area")).toHaveCount(0);
  await page.getByRole("button", { name: "纯图片", exact: true }).click();
  await expect(page.locator(".word-content")).toHaveCount(0);
  await expect(page.locator(".image-area")).toHaveCount(50);
  await page.getByRole("button", { name: "图文", exact: true }).click();

  // This webServer runs Vite without --mode edit: project writing
  // and image editing must be disabled outside the local editor.
  await expect(page.getByRole("button", { name: "图片编辑" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "保存到项目" })).toBeDisabled();

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
