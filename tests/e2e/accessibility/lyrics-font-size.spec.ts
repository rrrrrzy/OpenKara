import AxeBuilder from "@axe-core/playwright";
import { expect, test, WCAG_AA_TAGS } from "./fixtures/accessibility-test";

const longLine =
  "These are long lyrics that should wrap across several lines while staying readable at the largest available size";

test("XXL supports keyboard controls, wraps long lyrics, and keeps scrolling available", async ({
  page,
  tauriMock,
  a11y,
}) => {
  await page.goto("/");
  await expect(page.getByText("Earfquake")).toBeVisible();
  await tauriMock.setMockLyrics({
    song_id: "earfquake",
    raw_lrc: "[00:00.00]" + longLine,
    offset_ms: 0,
    source: "manual",
    lines: Array.from({ length: 12 }, (_, index) => ({
      time_ms: index * 10000,
      text: index === 0 ? longLine : `Another lyric line ${index}`,
      words: null,
      bg_words: null,
      roman: null,
      section: null,
    })),
  });
  await page.getByRole("button", { name: "Earfquake", exact: true }).dblclick();
  await expect(page.getByText(longLine, { exact: true })).toBeVisible();
  await tauriMock.setPlaybackSnapshot({
    state: "paused",
    is_playing: false,
    position_ms: 0,
  });
  await a11y.disableTransitions();
  const viewport = page.getByTestId("lyrics-scroll-viewport");
  await viewport.hover();
  const increase = page.getByRole("button", {
    name: "A+ Increase lyrics size",
    exact: true,
  });
  const decrease = page.getByRole("button", {
    name: "A- Decrease lyrics size",
    exact: true,
  });
  const reset = page.getByRole("button", {
    name: "Reset lyrics size",
    exact: true,
  });
  const controls = increase.locator("..");
  await increase.focus();
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await expect(controls.getByText("XL", { exact: true })).toBeVisible();
  const main = page.getByText(longLine, { exact: true });
  const xl = await main.evaluate((element) =>
    Number.parseFloat(getComputedStyle(element).fontSize),
  );
  await page.keyboard.press("Enter");
  await expect(controls.getByText("XXL", { exact: true })).toBeVisible();
  const xxl = await main.evaluate((element) =>
    Number.parseFloat(getComputedStyle(element).fontSize),
  );
  expect(xxl).toBeGreaterThan(xl);
  const writes = () =>
    tauriMock
      .getInvokeCalls()
      .then((calls) =>
        calls.filter((call) => call.cmd === "set_lyrics_font_step"),
      );
  const before = (await writes()).length;
  await page.keyboard.press("Enter");
  await expect(controls.getByText("XXL", { exact: true })).toBeVisible();
  expect((await writes()).length).toBe(before);
  expect((await writes()).at(-1)?.args).toEqual({ step: 3 });
  for (const theme of ["dark", "light"] as const) {
    await a11y.setTheme(theme);
    const results = await new AxeBuilder({ page })
      .include('div:has(> button[aria-label="A+ Increase lyrics size"])')
      .withTags(WCAG_AA_TAGS)
      .analyze();
    expect(results.violations).toEqual([]);
  }
  const wrapped = await main.evaluate((element) => {
    const style = getComputedStyle(element);
    return (
      element.getBoundingClientRect().height >
      Number.parseFloat(style.lineHeight)
    );
  });
  expect(wrapped).toBe(true);
  const dimensions = await viewport.evaluate((element) => ({
    scroll: element.scrollWidth,
    width: element.clientWidth,
    scrollHeight: element.scrollHeight,
    height: element.clientHeight,
  }));
  expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.width + 1);
  expect(dimensions.scrollHeight).toBeGreaterThan(dimensions.height);
  await page
    .getByRole("button", { name: "Switch to centered lyrics", exact: true })
    .click();
  const centeredXXL = await main.evaluate((element) =>
    Number.parseFloat(getComputedStyle(element).fontSize),
  );
  await decrease.focus();
  await page.keyboard.press("Enter");
  await expect(controls.getByText("XL", { exact: true })).toBeVisible();
  const centeredXL = await main.evaluate((element) =>
    Number.parseFloat(getComputedStyle(element).fontSize),
  );
  expect(centeredXXL / centeredXL).toBeCloseTo(1.42 / 1.28, 2);
  await reset.focus();
  await page.keyboard.press("Enter");
  await expect(controls.getByText("M", { exact: true })).toBeVisible();
  expect((await writes()).at(-1)?.args).toEqual({ step: 0 });
});
