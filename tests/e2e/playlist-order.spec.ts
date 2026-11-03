import { E2E_MOCK_DATA } from "@/mock/tauri-mock-data";
import { createTauriMockScript } from "./fixtures/tauri-mock";
import { expect, test } from "./accessibility/fixtures/accessibility-test";

const hashes = ["earfquake", "counting-stars", "see-you-again"];
const playlist = {
  id: "ordered",
  name: "Ordered playlist",
  song_count: 3,
  created_at: 1,
  updated_at: 1,
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript(
    createTauriMockScript({
      ...E2E_MOCK_DATA,
      playlists: [
        playlist,
        { ...playlist, id: "empty", name: "Empty playlist", song_count: 0 },
      ],
      playlistSongs: { ordered: hashes, empty: [] },
    }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: /Ordered playlist/ }).click();
  await expect(
    page.getByRole("button", { name: "Replace upcoming queue" }),
  ).toBeEnabled();
});

test("keyboard sorting persists after leaving and reopening the playlist", async ({
  page,
  tauriMock,
  a11y,
}) => {
  const rows = page.getByTestId("song-list").locator("[data-song-hash]");
  const handle = page.getByRole("button", {
    name: "Reorder Earfquake",
    exact: true,
  });
  await handle.focus();
  await page.keyboard.press("Space");
  await expect(handle).toHaveAttribute("aria-pressed", "true");
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: /Song (picked up|at position)/ }),
  ).toBeAttached();
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  await page.keyboard.press("ArrowDown");
  await expect(
    page.getByText("Song at position 2.", { exact: true }),
  ).toBeAttached();
  await page.keyboard.press("Space");
  await expect(rows.first()).toHaveAttribute(
    "data-song-hash",
    "counting-stars",
  );
  await expect(handle).toBeFocused();
  await expect
    .poll(
      async () =>
        (await tauriMock.getInvokeCalls()).filter(
          (call) => call.cmd === "reorder_playlist_songs",
        ).length,
    )
    .toBe(1);
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await page.getByRole("button", { name: /Ordered playlist/ }).click();
  await expect(rows.first()).toHaveAttribute(
    "data-song-hash",
    "counting-stars",
  );
  await a11y.axeForThemes();
  await page.screenshot({ path: test.info().outputPath("playlist.png") });
});

test("pointer drag and single-song menu use the same saved order", async ({
  page,
  tauriMock,
}) => {
  const source = page.getByRole("button", {
    name: "Reorder Earfquake",
    exact: true,
  });
  const target = page.getByRole("button", {
    name: "Reorder Counting Stars",
    exact: true,
  });
  const start = (await source.boundingBox())!;
  const end = (await target.boundingBox())!;
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
  await page.mouse.down();
  await page.mouse.move(end.x + end.width / 2, end.y + end.height / 2, {
    steps: 12,
  });
  await page.mouse.up();
  const rows = page.getByTestId("song-list").locator("[data-song-hash]");
  await expect(rows.first()).toHaveAttribute(
    "data-song-hash",
    "counting-stars",
  );
  await expect(
    page.getByRole("button", { name: "Replace upcoming queue" }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "Earfquake", exact: true })
    .click({ button: "right" });
  await expect
    .poll(() => tauriMock.getLastNativeMenu())
    .toMatchObject({
      items: expect.arrayContaining([
        expect.objectContaining({ label: "Move up" }),
        expect.objectContaining({ label: "Move down" }),
      ]),
    });
  await tauriMock.clickNativeMenuItem("Move up");
  await expect(rows.first()).toHaveAttribute("data-song-hash", "earfquake");
});

test("replacement includes every playlist song and does not start playback", async ({
  page,
  tauriMock,
}) => {
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await page
    .getByRole("button", { name: "One Last Kiss", exact: true })
    .click({ button: "right" });
  await expect
    .poll(() => tauriMock.getLastNativeMenu())
    .toMatchObject({
      items: expect.arrayContaining([
        expect.objectContaining({ label: "Add to Queue" }),
      ]),
    });
  await tauriMock.clickNativeMenuItem("Add to Queue");
  await page.getByRole("button", { name: /Ordered playlist/ }).click();
  await expect(
    page.getByRole("button", { name: "Replace upcoming queue" }),
  ).toBeEnabled();
  await page
    .getByRole("textbox", { name: "Search", exact: true })
    .fill("Earfquake");
  await expect(
    page.getByTestId("song-list").locator("[data-song-hash]"),
  ).toHaveCount(1);
  const before = await tauriMock.getPlaybackSnapshot();
  await page.getByRole("button", { name: "Replace upcoming queue" }).click();
  await expect(page.getByText("Queued 3 songs")).toBeVisible();
  await page.getByRole("button", { name: "Queue", exact: true }).click();
  await page.getByRole("textbox", { name: "Search", exact: true }).fill("");
  const queue = page.getByTestId("queue-panel");
  await expect(queue.getByText("One Last Kiss", { exact: true })).toHaveCount(
    0,
  );
  await expect(queue.getByText("Earfquake", { exact: true })).toBeVisible();
  await expect(
    queue.getByText("Counting Stars", { exact: true }),
  ).toBeVisible();
  await expect(
    queue.getByText("See You Again (feat. Kali Uchis)", { exact: true }),
  ).toBeVisible();
  const after = await tauriMock.getPlaybackSnapshot();
  expect(after.song_id).toBe(before.song_id);
  expect(after.is_playing).toBe(before.is_playing);
  expect(
    (await tauriMock.getInvokeCalls()).filter((call) =>
      ["play_song", "play_now", "load_song"].includes(call.cmd),
    ),
  ).toEqual([]);
});

test("replacement preserves active playback and an empty playlist disables the action", async ({
  page,
  tauriMock,
}) => {
  await tauriMock.setPlaybackSnapshot({
    song_id: "earfquake",
    state: "playing",
    is_playing: true,
    position_ms: 2000,
  });
  await page.getByRole("button", { name: "Replace upcoming queue" }).click();
  await expect(page.getByText("Queued 3 songs")).toBeVisible();
  const playback = await tauriMock.getPlaybackSnapshot();
  expect(playback.song_id).toBe("earfquake");
  expect(playback.is_playing).toBe(true);
  await page.getByRole("button", { name: /Empty playlist/ }).click();
  await expect(
    page.getByRole("button", { name: "Replace upcoming queue" }),
  ).toBeDisabled();
});

test("dragging near the edge scrolls a virtualized playlist and saves the drop", async ({
  page,
  tauriMock,
}) => {
  const songs = Array.from({ length: 60 }, (_, index) => ({
    ...E2E_MOCK_DATA.songs[0],
    hash: `long-${index}`,
    title: `Long song ${index}`,
    cover_art: null,
  }));
  await page.addInitScript(
    createTauriMockScript({
      ...E2E_MOCK_DATA,
      songs,
      playlists: [{ ...playlist, song_count: songs.length }],
      playlistSongs: { ordered: songs.map((song) => song.hash) },
    }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: /Ordered playlist/ }).click();
  const source = page.getByRole("button", {
    name: "Reorder Long song 0",
    exact: true,
  });
  const start = (await source.boundingBox())!;
  const list = page.getByTestId("song-list");
  const bounds = (await list.boundingBox())!;
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
  await page.mouse.down();
  await page.mouse.move(bounds.x + 12, bounds.y + bounds.height - 8, {
    steps: 15,
  });
  await expect
    .poll(() => list.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(500);
  await page.mouse.up();
  await expect
    .poll(
      async () =>
        (await tauriMock.getInvokeCalls()).filter(
          (call) => call.cmd === "reorder_playlist_songs",
        ).length,
    )
    .toBe(1);
});
