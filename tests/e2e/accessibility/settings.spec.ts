import { expect, test } from "./fixtures/accessibility-test";

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
