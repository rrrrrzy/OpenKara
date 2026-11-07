import { E2E_MOCK_DATA } from "@/mock/tauri-mock-data";
import { createTauriMockScript } from "../fixtures/tauri-mock";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, WCAG_AA_TAGS } from "./fixtures/accessibility-test";

test.describe("Settings accessibility", () => {
  test.describe.configure({ retries: 0 });

  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("Earfquake")).toBeVisible();
  });

  test("settings opens as a modal dialog and the close button is focused", async ({
    page,
  }) => {
    const settingsButton = page.getByRole("button", { name: "Settings" });
    await settingsButton.focus();
    await page.keyboard.press("Enter");

    const dialog = page.getByRole("dialog", { name: "Preferences" });
    const closeButton = dialog.getByRole("button", { name: "Close" });
    await expect(dialog).toBeVisible();
    await expect(closeButton).toBeFocused();
  });

  test("settings dialog traps focus and restores it on close", async ({
    page,
  }) => {
    const settingsButton = page.getByRole("button", { name: "Settings" });
    await settingsButton.focus();
    await page.keyboard.press("Enter");

    const dialog = page.getByRole("dialog", { name: "Preferences" });
    const closeButton = dialog.getByRole("button", { name: "Close" });
    await expect(dialog).toBeVisible();
    await expect(closeButton).toBeFocused();

    await page.keyboard.press("Tab");
    const focusedInside = await page.evaluate(() => {
      const dialogEl = document.querySelector('[role="dialog"]');
      const active = document.activeElement;
      return Boolean(dialogEl && active && dialogEl.contains(active));
    });
    expect(focusedInside).toBe(true);

    for (let i = 0; i < 40; i++) {
      await page.keyboard.press("Tab");
    }
    const stillInside = await page.evaluate(() => {
      const dialogEl = document.querySelector('[role="dialog"]');
      const active = document.activeElement;
      return Boolean(dialogEl && active && dialogEl.contains(active));
    });
    expect(stillInside).toBe(true);

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(settingsButton).toBeFocused();
  });

  test("settings sections have no axe violations and correct heading structure", async ({
    page,
    a11y,
  }) => {
    await page.getByRole("button", { name: "Settings" }).click();
    const dialog = page.getByRole("dialog", { name: "Preferences" });
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByRole("heading", { name: "Preferences" }),
    ).toBeVisible();
    await expect(page.getByText("Karaoke Library")).toBeVisible();
    await a11y.axeForThemes();
  });

  test("form controls in settings have associated labels", async ({ page }) => {
    await page.getByRole("button", { name: "Settings" }).click();
    const dialog = page.getByRole("dialog", { name: "Preferences" });
    await expect(dialog).toBeVisible();

    const labeledControls = dialog.locator(
      "label, [aria-label], [aria-labelledby]",
    );
    await expect(labeledControls.first()).toBeVisible();

    const unlabeled = await dialog.evaluate((root) => {
      const controls = Array.from(
        root.querySelectorAll("input, select, textarea"),
      );
      return controls
        .filter((control) => {
          if (!(control instanceof HTMLElement)) return false;
          if (control.getAttribute("type") === "hidden") return false;
          if (control.getAttribute("aria-label")) return false;
          if (control.getAttribute("aria-labelledby")) return false;
          const id = control.getAttribute("id");
          if (id && root.querySelector(`label[for="${CSS.escape(id)}"]`)) {
            return false;
          }
          if (control.closest("label")) return false;
          return true;
        })
        .map(
          (control) =>
            `${control.tagName.toLowerCase()}[type=${control.getAttribute("type") ?? ""}]`,
        );
    });
    expect(unlabeled).toEqual([]);
  });

  test("automatic lyrics updates support keyboard toggling and retain the choice", async ({
    page,
  }) => {
    await page.getByRole("button", { name: "Settings" }).click();
    const dialog = page.getByRole("dialog", { name: "Preferences" });
    const toggle = dialog.getByRole("checkbox", {
      name: "Automatically update lyrics online",
    });
    await expect(toggle).toBeChecked();
    await expect(toggle).toHaveAccessibleDescription(
      /missing lyrics can still be found online/,
    );
    await toggle.scrollIntoViewIfNeeded();
    await dialog
      .getByRole("checkbox", { name: "Blur lyrics that are not playing" })
      .focus();
    await page.keyboard.press("Tab");
    await expect(toggle).toBeFocused();
    await page.keyboard.press("Space");
    await expect(toggle).not.toBeChecked();
    await dialog.getByRole("button", { name: "Close" }).click();
    await page.getByRole("button", { name: "Settings" }).click();
    await expect(toggle).not.toBeChecked();
  });
});

test("cover backdrop sliders support keyboard editing, theme defaults, and reset", async ({
  page,
  tauriMock,
  context,
  a11y,
}) => {
  test.setTimeout(60_000);
  await page.goto("/");
  await expect(page.getByText("Earfquake")).toBeVisible();
  await page.getByRole("button", { name: "Earfquake", exact: true }).dblclick();
  await expect(page.getByRole("button", { name: /pause/i })).toBeVisible();
  const audience = await context.newPage();
  const snapshot = E2E_MOCK_DATA.playbackSnapshot;
  await audience.addInitScript(
    createTauriMockScript({
      ...E2E_MOCK_DATA,
      playbackSnapshot: { ...snapshot, song_id: "earfquake" },
    }),
  );
  await audience.goto("/?mode=fullscreen-player");
  const audienceImage = audience
    .locator("[data-native-stage-backdrop] > div")
    .first();
  await expect(audienceImage).toBeVisible();
  await page.getByRole("button", { name: "Settings" }).click();
  const dialog = page.getByRole("dialog", { name: "Preferences" });
  const hide = dialog.getByRole("checkbox", {
    name: "Disable blurred album art backdrop",
  });
  await hide.uncheck();
  const image = page.locator("[data-native-stage-backdrop] > div").first();
  await expect(image).toHaveCSS("opacity", "0.4");
  await expect(image).toHaveCSS("filter", /blur\(40px\)/);
  const expectMatchingBackdrop = async () => {
    await expect(audienceImage).toHaveCSS(
      "opacity",
      await image.evaluate((el) => getComputedStyle(el).opacity),
    );
    await expect(audienceImage).toHaveCSS(
      "filter",
      await image.evaluate((el) => getComputedStyle(el).filter),
    );
    const scrim = "[data-native-stage-backdrop] > div:nth-child(2)";
    await expect(audience.locator(scrim)).toHaveCSS(
      "background-color",
      await page
        .locator(scrim)
        .evaluate((el) => getComputedStyle(el).backgroundColor),
    );
  };
  await expectMatchingBackdrop();
  const viewport = await page
    .getByTestId("lyrics-scroll-viewport")
    .elementHandle();
  const blur = dialog.getByRole("slider", { name: "Blur", exact: true });
  const opacity = dialog.getByRole("slider", { name: "Opacity", exact: true });
  await expect(blur).toHaveValue("40");
  await expect(opacity).toHaveValue("40");
  await dialog.getByRole("radio", { name: "Light", exact: true }).check();
  await expect(opacity).toHaveValue("55");
  await expect(image).toHaveCSS("opacity", "0.55");
  await expectMatchingBackdrop();
  await opacity.scrollIntoViewIfNeeded();
  await opacity.focus();
  await page.keyboard.press("Home");
  await expect(opacity).toHaveValue("0");
  await blur.focus();
  await page.keyboard.press("End");
  await expect(blur).toHaveValue("80");
  await expect(image).toHaveCSS("filter", /blur\(80px\)/);
  await expect(image).toHaveCSS("opacity", "0");
  await expectMatchingBackdrop();
  expect(await viewport?.evaluate((element) => element.isConnected)).toBe(true);
  const overscan = await image.evaluate((element) => {
    const imageBounds = element.getBoundingClientRect();
    const stageBounds = element.parentElement!.getBoundingClientRect();
    return [
      stageBounds.left - imageBounds.left,
      imageBounds.right - stageBounds.right,
      stageBounds.top - imageBounds.top,
      imageBounds.bottom - stageBounds.bottom,
    ];
  });
  for (const margin of overscan) expect(margin).toBeGreaterThanOrEqual(240);
  await expect
    .poll(
      async () =>
        (await tauriMock.getInvokeCalls())
          .filter((call) => call.cmd === "set_cover_art_backdrop_style")
          .at(-1)?.args,
    )
    .toEqual({ blurPx: 80, opacityPercent: 0 });
  await dialog.getByRole("radio", { name: "Dark", exact: true }).check();
  await expect(opacity).toHaveValue("0");
  for (const theme of ["dark", "light"] as const) {
    await a11y.setTheme(theme);
    const result = await new AxeBuilder({ page })
      .include("section:has(#settings-backdrop-blur)")
      .withTags(WCAG_AA_TAGS)
      .analyze();
    expect(result.violations).toEqual([]);
  }
  await a11y.setTheme("dark");
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("button", { name: "Settings" }).click();
  await expect(blur).toHaveValue("80");
  await expect(opacity).toHaveValue("0");
  await hide.check();
  await expect(image).toHaveCount(0);
  await expect(audienceImage).toBeVisible();
  await expect(blur).toBeEnabled();

  const audienceToggle = dialog.getByRole("checkbox", {
    name: "Show cover-art backdrop on the audience display",
  });
  await hide.focus();
  await page.keyboard.press("Tab");
  await expect(audienceToggle).toBeFocused();
  await page.keyboard.press("Space");
  await expect(audienceToggle).not.toBeChecked();
  await expect(audienceImage).toHaveCount(0);
  await expect(blur).toBeDisabled();
  await expect(opacity).toBeDisabled();
  await hide.uncheck();
  await expect(image).toBeVisible();
  await expect(audienceImage).toHaveCount(0);
  await expect(blur).toHaveValue("80");
  await audienceToggle.check();
  await opacity.focus();
  await page.keyboard.press("End");
  await blur.focus();
  await page.keyboard.press("Home");
  await expect(image).toHaveCSS("opacity", "1");
  await expect(image).toHaveCSS("filter", /blur\(0px\)/);
  await expectMatchingBackdrop();
  const audienceAxe = await new AxeBuilder({ page: audience })
    .withTags(WCAG_AA_TAGS)
    .analyze();
  expect(audienceAxe.violations).toEqual([]);
  await dialog
    .getByRole("button", { name: "Restore defaults", exact: true })
    .click();
  await expect(blur).toHaveValue("40");
  await expect(opacity).toHaveValue("40");
  await expect
    .poll(
      async () =>
        (await tauriMock.getInvokeCalls())
          .filter((call) => call.cmd === "set_cover_art_backdrop_style")
          .at(-1)?.args,
    )
    .toEqual({ blurPx: 40, opacityPercent: null });
  await expectMatchingBackdrop();
});
