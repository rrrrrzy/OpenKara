import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "vite-plus/test";
import { createMockBackend } from "@/lib/backend/mock-backend";
import type { AppSettings } from "@/types/ipc";
import type { WebviewSyncChannel } from "@/runtime/webview-sync";
import {
  createSettingsStore,
  type SettingsSyncSnapshot,
} from "./settings-store";

const { notifyError } = vi.hoisted(() => ({ notifyError: vi.fn() }));
vi.mock("@/lib/errors", () => ({ notifyError }));

const detachedChannel: WebviewSyncChannel<SettingsSyncSnapshot> = {
  publish: () => {},
  subscribe: () => () => {},
  close: () => {},
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

function setup() {
  const backend = createMockBackend();
  const write = vi.spyOn(backend.settings, "setCoverArtBackdropStyle");
  const instance = createSettingsStore(detachedChannel, backend);
  return { ...instance, backend, write, state: instance.store.getState };
}

let baseSettings: AppSettings;

function settings(blur: number, opacity: number | null): AppSettings {
  return {
    ...baseSettings,
    cover_art_backdrop_blur_px: blur,
    cover_art_backdrop_opacity_percent: opacity,
  };
}

describe("cover art backdrop settings", () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    notifyError.mockReset();
    baseSettings = await createMockBackend().settings.getSettings();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  test("previews immediately and debounces the latest pair for 150ms", async () => {
    const h = setup();
    h.state().setCoverArtBackdropStyle(0, 100);
    expect(h.state().coverArtBackdropBlurPx).toBe(0);
    expect(h.state().coverArtBackdropOpacityPercent).toBe(100);
    await vi.advanceTimersByTimeAsync(100);
    h.state().setCoverArtBackdropStyle(80, 0);
    await vi.advanceTimersByTimeAsync(149);
    expect(h.write).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(h.write).toHaveBeenCalledExactlyOnceWith(80, 0);
    expect(await h.backend.settings.getSettings()).toMatchObject(
      settings(80, 0),
    );
    h.dispose();
  });

  test("serializes writes and merges edits made while a request is in flight", async () => {
    const h = setup();
    const first = deferred<AppSettings>();
    h.write.mockImplementationOnce(() => first.promise);
    h.state().setCoverArtBackdropStyle(10, 20);
    const flush = h.state().flushCoverArtBackdropStyle();
    h.state().setCoverArtBackdropStyle(25, 35);
    h.state().setCoverArtBackdropStyle(60, 75);
    await vi.advanceTimersByTimeAsync(200);
    h.state().hydrateAppSettings(settings(40, null));
    expect(h.write).toHaveBeenCalledTimes(1);
    expect(h.state().coverArtBackdropBlurPx).toBe(60);
    first.resolve(settings(10, 20));
    await flush;
    expect(h.write.mock.calls).toEqual([
      [10, 20],
      [60, 75],
    ]);
    expect(h.state().coverArtBackdropBlurPx).toBe(60);
    expect(h.state().coverArtBackdropOpacityPercent).toBe(75);
    h.dispose();
  });

  test("a failed save restores the last confirmed pair and reports the error", async () => {
    const h = setup();
    h.state().hydrateAppSettings(settings(30, 45));
    const error = new Error("disk write failed");
    h.write.mockRejectedValueOnce(error);
    h.state().setCoverArtBackdropStyle(70, 90);
    await h.state().flushCoverArtBackdropStyle();
    expect(h.state().coverArtBackdropBlurPx).toBe(30);
    expect(h.state().coverArtBackdropOpacityPercent).toBe(45);
    expect(notifyError).toHaveBeenCalledExactlyOnceWith(error);
    h.dispose();
  });

  test("a failed earlier request cannot roll back a newer edit", async () => {
    const h = setup();
    const first = deferred<AppSettings>();
    h.write.mockImplementationOnce(() => first.promise);
    h.state().setCoverArtBackdropStyle(10, 20);
    const flush = h.state().flushCoverArtBackdropStyle();
    h.state().setCoverArtBackdropStyle(80, 100);
    first.reject(new Error("first write failed"));
    await flush;
    expect(h.state().coverArtBackdropBlurPx).toBe(80);
    expect(h.state().coverArtBackdropOpacityPercent).toBe(100);
    h.dispose();
  });

  test("closing settings flushes pending edits and reset restores theme defaults", async () => {
    const h = setup();
    h.state().setCoverArtBackdropStyle(80, 100);
    h.state().close();
    await h.state().flushCoverArtBackdropStyle();
    expect(h.write).toHaveBeenCalledExactlyOnceWith(80, 100);
    h.state().setCoverArtBackdropStyle(40, null);
    await h.state().flushCoverArtBackdropStyle();
    const saved = await h.backend.settings.getSettings();
    const reloaded = createSettingsStore(detachedChannel, h.backend);
    reloaded.store.getState().hydrateAppSettings(saved);
    expect(reloaded.store.getState().coverArtBackdropBlurPx).toBe(40);
    expect(reloaded.store.getState().coverArtBackdropOpacityPercent).toBeNull();
    h.dispose();
    reloaded.dispose();
  });

  test("dispose flushes before closing the sync channel", async () => {
    const close = vi.fn();
    const publish = vi.fn(() => {
      expect(close).not.toHaveBeenCalled();
    });
    const backend = createMockBackend();
    const instance = createSettingsStore(
      { ...detachedChannel, close, publish },
      backend,
    );
    instance.store.getState().setCoverArtBackdropStyle(75, 60);
    instance.dispose();
    expect(close).not.toHaveBeenCalled();
    await instance.store.getState().flushCoverArtBackdropStyle();
    expect(close).toHaveBeenCalledOnce();
    expect(await backend.settings.getSettings()).toMatchObject(
      settings(75, 60),
    );
  });

  test("preview and confirmed values propagate to another window", async () => {
    const listeners = new Set<(snapshot: SettingsSyncSnapshot) => void>();
    const channel = (): WebviewSyncChannel<SettingsSyncSnapshot> => {
      let ownListener: ((snapshot: SettingsSyncSnapshot) => void) | undefined;
      return {
        subscribe: (listener) => {
          ownListener = listener;
          listeners.add(listener);
          return () => {
            listeners.delete(listener);
          };
        },
        publish: (snapshot) => {
          for (const listener of listeners)
            if (listener !== ownListener) listener(snapshot);
        },
        close: () => {},
      };
    };
    const backend = createMockBackend();
    const primary = createSettingsStore(channel(), backend);
    const secondary = createSettingsStore(channel(), backend);
    primary.store.getState().setCoverArtBackdropStyle(65, 80);
    expect(secondary.store.getState().coverArtBackdropBlurPx).toBe(65);
    await primary.store.getState().flushCoverArtBackdropStyle();
    expect(secondary.store.getState().coverArtBackdropOpacityPercent).toBe(80);
    primary.dispose();
    secondary.dispose();
  });
});
