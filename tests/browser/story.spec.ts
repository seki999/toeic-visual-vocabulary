import { test, expect } from "@playwright/test";
import { readFile, readdir } from "node:fs/promises";
import { readFileSync } from "node:fs";
import type { Story } from "../../src/story/types";
const story: Story = JSON.parse(
  readFileSync("public/stories/list01.story.json", "utf8"),
);
async function speechMock(page: import("@playwright/test").Page) {
  await page.addInitScript(() => {
    (window as any).SpeechSynthesisUtterance = class {};
    let last: SpeechSynthesisUtterance | undefined;
    const voices = [
      { name: "English One", voiceURI: "en1", lang: "en-US" },
      { name: "English Two", voiceURI: "en2", lang: "en-US" },
      { name: "Chinese", voiceURI: "zh", lang: "zh-CN" },
    ];
    let changed: () => void = () => {};
    const spoken: any[] = [];
    (window as any).__storySpoken = spoken;
    (window as any).__storyEnd = () =>
      last?.onend?.({} as SpeechSynthesisEvent);
    (window as any).__storyLoadVoices = () => changed();
    Object.defineProperty(window, "speechSynthesis", {
      value: {
        getVoices: () => voices,
        addEventListener: (_name: string, callback: () => void) => {
          changed = callback;
        },
        removeEventListener: () => {},
        cancel: () => {
          last = undefined;
        },
        pause: () => {},
        resume: () => {},
        speak: (u: SpeechSynthesisUtterance) => {
          last = u;
          spoken.push({
            text: u.text,
            lang: u.lang,
            rate: u.rate,
            voice: u.voice?.voiceURI,
          });
        },
      },
    });
  });
}
test("story review navigation, role voices, images, pause and mutual exclusion", async ({
  page,
}) => {
  await speechMock(page);
  const custom = structuredClone(story);
  custom.scenes[0].lines[0].image =
    "images/stories/list01/line-one.webp" as any;
  await page.route("**/stories/list01.story.json", (r) =>
    r.fulfill({ json: custom }),
  );
  const file = (await readdir("public/images/list01")).find((n) =>
    n.endsWith(".webp"),
  )!;
  const bytes = await readFile("public/images/list01/" + file);
  await page.route("**/images/stories/list01/*.webp", (r) =>
    r.fulfill({ contentType: "image/webp", body: bytes }),
  );
  const requested: string[] = [];
  page.on("request", (r) => requested.push(r.url()));
  await page.goto("/");
  const review = page.getByRole("region", { name: "Story Review 故事复习" });
  await expect(review).toBeVisible();
  expect(
    await review.evaluate(
      (el) => !!el.previousElementSibling?.classList.contains("cards"),
    ),
  ).toBe(true);
  await review.getByRole("button", { name: /Story Review/ }).click();
  await expect(review).toContainText("词汇记录覆盖 50 / 50");
  await expect(review.locator("mark").first()).toHaveText("abstain");
  await page.evaluate(() => (window as any).__storyLoadVoices());
  await review.getByLabel("故事朗读模式").selectOption("en");
  await review.getByRole("button", { name: "播放故事", exact: true }).click();
  await expect(page.locator(".player-bar")).toBeHidden();
  await expect(review.locator(".story-picture img")).toHaveAttribute(
    "src",
    /line-one.webp/,
  );
  expect(
    await page.evaluate(() => (window as any).__storySpoken.at(-1)),
  ).toMatchObject({ rate: 0.8, lang: "en-US", voice: "en1" });
  await review.getByRole("button", { name: "下一句", exact: true }).click();
  await expect(review.locator(".story-speaker")).toContainText("Ben");
  await expect(review.locator(".story-picture img")).toHaveAttribute(
    "src",
    /scene01.webp/,
  );
  expect(
    await page.evaluate(() => (window as any).__storySpoken.at(-1).voice),
  ).toBe("en2");
  await review.getByRole("button", { name: "暂停故事" }).click();
  const count = await page.evaluate(() => (window as any).__storySpoken.length);
  await review.getByRole("button", { name: "下一句", exact: true }).click();
  expect(await page.evaluate(() => (window as any).__storySpoken.length)).toBe(
    count,
  );
  await review.getByRole("button", { name: "继续故事" }).click();
  await review.getByRole("button", { name: "下一场景" }).click();
  await expect(review.locator(".story-picture img")).toHaveAttribute(
    "src",
    /scene02.webp/,
  );
  await review.getByRole("button", { name: "上一场景" }).click();
  await expect(review).toContainText("场景 1 / 5");
  const rate = review.getByLabel("故事英语语速");
  await rate.fill("");
  await expect(rate).toHaveValue("");
  await rate.fill("1.1");
  await rate.blur();
  await expect(review.getByRole("status")).toHaveText("故事已停止");
  await review.getByRole("button", { name: "播放故事", exact: true }).click();
  expect(
    await page.evaluate(() => (window as any).__storySpoken.at(-1).rate),
  ).toBe(1.1);
  await page
    .locator(".card")
    .first()
    .getByRole("button", { name: "朗读 abstain", exact: true })
    .click();
  await expect(review.getByRole("status")).toHaveText("故事已停止");
  await expect(page.locator(".player-bar")).toBeVisible();
  await review.getByRole("button", { name: "播放故事", exact: true }).click();
  await page
    .getByRole("button", { name: "02 List 02 50 个词条", exact: true })
    .click();
  await expect(page.locator(".story-review")).toHaveCount(0);
  await expect(page.locator(".card")).toHaveCount(50);
  expect(requested.some((url) => url.includes("list02.story"))).toBe(false);
});
for (const [name, width, height] of [
  ["desktop", 1440, 1000],
  ["phone", 390, 844],
  ["landscape", 844, 390],
  ["tablet", 768, 1024],
] as const) {
  test(`${name}: story layout and missing images degrade gracefully`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await page.goto("/");
    const review = page.locator(".story-review");
    await review.getByRole("button", { name: /Story Review/ }).click();
    await expect(review.locator(".story-placeholder")).toContainText(
      "场景图片待添加",
    );
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
    for (const layout of ["image", "text", "mixed"]) {
      await review.getByLabel("故事显示模式").selectOption(layout);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(width);
    }
    await review.locator("h2").scrollIntoViewIfNeeded();
    await page.screenshot({ path: `test-results/story-${name}.png` });
    await review.getByRole("button", { name: /Story Review/ }).click();
    await expect(review.locator(".story-content")).toHaveCount(0);
  });
}
