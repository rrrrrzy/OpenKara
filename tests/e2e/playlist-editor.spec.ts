import { E2E_MOCK_DATA } from "@/mock/tauri-mock-data";
import { createTauriMockScript } from "./fixtures/tauri-mock";
import { expect, test } from "./accessibility/fixtures/accessibility-test";

const playlist = {
  id: "show",
  name: "Show playlist",
  song_count: 2,
  created_at: 1,
  updated_at: 1,
};
test.beforeEach(async ({ page }) => {
  await page.addInitScript(
    createTauriMockScript({
      ...E2E_MOCK_DATA,
      playlists: [playlist],
      playlistSongs: { show: ["earfquake", "counting-stars"] },
    }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: /Show playlist/ }).click();
  await page
    .getByRole("button", { name: "Edit playlist", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Check readiness" }),
  ).toBeEnabled();
});

test("edit levels and order, save, reopen, and start with a copied preset", async ({
  page,
  tauriMock,
  a11y,
}) => {
  const dialog = page.getByRole("dialog", { name: "Edit playlist" });
  await dialog
    .getByRole("spinbutton", { name: "Vocal level for Earfquake", exact: true })
    .fill("0");
  await dialog
    .getByRole("spinbutton", {
      name: "Accompaniment level for Earfquake",
      exact: true,
    })
    .fill("85");
  await dialog
    .getByRole("button", { name: "Move down", exact: true })
    .first()
    .click();
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(
    dialog.getByText("Playlist saved.", { exact: true }),
  ).toBeVisible();
  await a11y.axeForThemes();
  await page.screenshot({
    path: test.info().outputPath("playlist-editor.png"),
  });
  await dialog
    .getByRole("button", { name: "Close", exact: true })
    .last()
    .click();
  await expect(
    page.getByRole("button", { name: "Edit playlist", exact: true }),
  ).toBeFocused();
  await page
    .getByRole("button", { name: "Edit playlist", exact: true })
    .click();
  await expect(
    dialog.getByRole("spinbutton", {
      name: "Vocal level for Earfquake",
      exact: true,
    }),
  ).toHaveValue("0");
  await expect(dialog.locator("tbody tr").first()).toContainText(
    "Counting Stars",
  );
  page.once("dialog", (confirmation) => confirmation.accept());
  await dialog
    .getByRole("button", { name: "Play saved playlist", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await expect
    .poll(
      async () =>
        (await tauriMock.getInvokeCalls())
          .filter((call) => call.cmd === "play")
          .at(-1)?.args,
    )
    .toMatchObject({
      songId: "counting-stars",
      mix: { vocals: 1, drums: 1, bass: 1, other: 1 },
    });
});

test("paste preview requires explicit matches and rejects duplicates", async ({
  page,
  a11y,
}) => {
  const dialog = page.getByRole("dialog", { name: "Edit playlist" });
  await dialog
    .getByRole("button", { name: "Paste a list", exact: true })
    .click();
  const text = dialog.getByRole("textbox").first();
  await text.fill(
    "Title\tArtist\tVocals\tAccompaniment\nEarfquake\tTyler, The Creator\t0\t100\nEarfquake\tTyler, The Creator\t100\t100",
  );
  await dialog
    .getByRole("button", { name: "Preview list", exact: true })
    .click();
  await expect(
    dialog.getByText(
      "Each song can appear only once. Resolve duplicate selections.",
    ),
  ).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Replace draft with this list" }),
  ).toBeDisabled();
  await text.fill(
    "Title\tArtist\tVocals\tAccompaniment\nUnknown\tGuest\t30\t85",
  );
  await dialog
    .getByRole("button", { name: "Preview list", exact: true })
    .click();
  const match = dialog.getByRole("combobox", { name: "Match song on line 2" });
  await match.selectOption("earfquake");
  await dialog
    .getByRole("button", { name: "Replace draft with this list" })
    .click();
  await expect(dialog.locator("tbody tr")).toHaveCount(1);
  await expect(
    dialog.getByRole("spinbutton", {
      name: "Vocal level for Earfquake",
      exact: true,
    }),
  ).toHaveValue("30");
  await a11y.axeCheck();
  page.once("dialog", (confirmation) => confirmation.accept());
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
});

test("keyboard reorder stays in the draft until saved", async ({
  page,
  tauriMock,
}) => {
  const handle = page
    .getByRole("dialog")
    .getByRole("button", { name: "Reorder Earfquake", exact: true });
  await handle.focus();
  await page.keyboard.press("Space");
  await expect(handle).toHaveAttribute("aria-pressed", "true");
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  await page.keyboard.press("ArrowDown");
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  await page.keyboard.press("Space");
  await expect(
    page.getByRole("dialog").locator("tbody tr").first(),
  ).toContainText("Counting Stars");
  expect(
    (await tauriMock.getInvokeCalls()).filter(
      (call) => call.cmd === "save_playlist_songs",
    ),
  ).toHaveLength(0);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Save", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (await tauriMock.getInvokeCalls()).filter(
          (call) => call.cmd === "save_playlist_songs",
        ).length,
    )
    .toBe(1);
});

test("a failed save keeps the draft and a missing stem blocks playback", async ({
  page,
  tauriMock,
}) => {
  await page.evaluate(() => {
    const invoke = window.__TAURI_INTERNALS__.invoke;
    window.__TAURI_INTERNALS__.invoke = (command, args) => {
      if (command === "save_playlist_songs")
        return Promise.reject({
          code: "database_error",
          message: "Playlist changed",
          retryable: false,
        });
      if (command === "check_playlist_ready")
        return Promise.resolve(["earfquake"]);
      return invoke(command, args);
    };
  });
  const dialog = page.getByRole("dialog", { name: "Edit playlist" });
  await dialog
    .getByRole("button", { name: "Play saved playlist", exact: true })
    .click();
  await expect(dialog.locator("tbody tr").first()).toContainText(
    "Needs attention",
  );
  expect(
    (await tauriMock.getInvokeCalls()).filter((call) => call.cmd === "play"),
  ).toHaveLength(0);
  await dialog
    .getByRole("spinbutton", { name: "Vocal level for Earfquake", exact: true })
    .fill("30");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText(
    "Your draft is retained",
  );
  await expect(
    dialog.getByRole("spinbutton", {
      name: "Vocal level for Earfquake",
      exact: true,
    }),
  ).toHaveValue("30");
  await expect(
    dialog.getByRole("button", { name: "Play saved playlist", exact: true }),
  ).toBeDisabled();
});
