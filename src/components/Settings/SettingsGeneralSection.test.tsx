// @vitest-environment jsdom

import { fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { act } from "react";
import { createRoot } from "react-dom/client";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "vite-plus/test";
import {
  createInitializedSettingsHarness,
  createSettingsHarness,
} from "@/test-utils/settings-controller";
import { SettingsControllerContext } from "./SettingsController.context";
import { SettingsGeneralSection } from "./SettingsGeneralSection";

describe("SettingsGeneralSection", () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;
  let user: ReturnType<typeof userEvent.setup>;

  beforeEach(() => {
    (
      globalThis as typeof globalThis & {
        IS_REACT_ACT_ENVIRONMENT?: boolean;
      }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    user = userEvent.setup();
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.restoreAllMocks();
  });

  test("renders the appearance radio group with the current theme preference checked", async () => {
    const harness = await createInitializedSettingsHarness({
      settings: { theme_preference: "system" },
    });

    act(() => {
      root.render(
        <SettingsControllerContext value={harness.controller}>
          <SettingsGeneralSection />
        </SettingsControllerContext>,
      );
    });

    const radios = container.querySelectorAll<HTMLInputElement>(
      'input[name="theme-preference"]',
    );
    expect(radios).toHaveLength(3);
    expect([...radios].find((radio) => radio.value === "system")?.checked).toBe(
      true,
    );
  });

  test("clicking a theme radio writes the preference", async () => {
    const harness = await createInitializedSettingsHarness({
      settings: { theme_preference: "dark" },
    });
    const setThemePreference = vi.spyOn(
      harness.backend.settings,
      "setThemePreference",
    );

    act(() => {
      root.render(
        <SettingsControllerContext value={harness.controller}>
          <SettingsGeneralSection />
        </SettingsControllerContext>,
      );
    });

    const lightRadio = container.querySelector<HTMLInputElement>(
      'input[name="theme-preference"][value="light"]',
    );
    expect(lightRadio).not.toBeNull();

    await user.click(lightRadio!);

    expect(setThemePreference).toHaveBeenCalledWith("light");
  });

  test("backdrop sliders preview independently and flush the final pair on interaction end", async () => {
    const harness = await createInitializedSettingsHarness();
    const write = vi.spyOn(
      harness.backend.settings,
      "setCoverArtBackdropStyle",
    );
    act(() => {
      root.render(
        <SettingsControllerContext value={harness.controller}>
          <SettingsGeneralSection />
        </SettingsControllerContext>,
      );
    });
    const blur = container.querySelector<HTMLInputElement>(
      "#settings-backdrop-blur",
    )!;
    const opacity = container.querySelector<HTMLInputElement>(
      "#settings-backdrop-opacity",
    )!;
    expect(blur.value).toBe("40");
    expect(opacity.value).toBe("40");
    act(() => {
      fireEvent.change(blur, { target: { value: "80" } });
    });
    expect(harness.preferencesStore.getState().coverArtBackdropBlurPx).toBe(80);
    expect(
      harness.preferencesStore.getState().coverArtBackdropOpacityPercent,
    ).toBeNull();
    act(() => {
      fireEvent.change(opacity, { target: { value: "0" } });
    });
    expect(write).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.pointerUp(opacity);
    });
    expect(write).toHaveBeenCalledExactlyOnceWith(80, 0);
    await user.click(
      [...container.querySelectorAll("button")].find(
        (button) => button.textContent === "Restore defaults",
      )!,
    );
    expect(blur.value).toBe("40");
    expect(opacity.value).toBe("40");
    expect(write).toHaveBeenLastCalledWith(40, null);
  });

  test("backdrop controls disable with the background and retain saved values", async () => {
    const harness = await createInitializedSettingsHarness({
      settings: {
        cover_art_backdrop: false,
        cover_art_backdrop_blur_px: 65,
        cover_art_backdrop_opacity_percent: 75,
      },
    });
    act(() => {
      root.render(
        <SettingsControllerContext value={harness.controller}>
          <SettingsGeneralSection />
        </SettingsControllerContext>,
      );
    });
    const blur = container.querySelector<HTMLInputElement>(
      "#settings-backdrop-blur",
    )!;
    const opacity = container.querySelector<HTMLInputElement>(
      "#settings-backdrop-opacity",
    )!;
    expect(blur.disabled).toBe(true);
    expect(opacity.disabled).toBe(true);
    expect(blur.value).toBe("65");
    expect(opacity.value).toBe("75");
    const hide = [...container.querySelectorAll("label")]
      .find((label) =>
        label.textContent?.includes("Disable blurred album art backdrop"),
      )!
      .querySelector("input")!;
    await user.click(hide);
    expect(blur.disabled).toBe(false);
    expect(opacity.value).toBe("75");
  });

  test("unmount flushes an edit before the debounce delay", async () => {
    const harness = await createInitializedSettingsHarness();
    const write = vi.spyOn(
      harness.backend.settings,
      "setCoverArtBackdropStyle",
    );
    act(() => {
      root.render(
        <SettingsControllerContext value={harness.controller}>
          <SettingsGeneralSection />
        </SettingsControllerContext>,
      );
    });
    act(() => {
      fireEvent.change(container.querySelector("#settings-backdrop-blur")!, {
        target: { value: "20" },
      });
    });
    await act(async () => {
      root.render(null);
    });
    expect(write).toHaveBeenCalledExactlyOnceWith(20, null);
  });

  test("leaves lyric blur off until the user opts in", async () => {
    const harness = await createInitializedSettingsHarness();
    const setLyricsBlurInactive = vi.spyOn(
      harness.backend.settings,
      "setLyricsBlurInactive",
    );

    act(() => {
      root.render(
        <SettingsControllerContext value={harness.controller}>
          <SettingsGeneralSection />
        </SettingsControllerContext>,
      );
    });

    const blurLabel = [...container.querySelectorAll("label")].find((label) =>
      label.textContent?.includes("Blur lyrics that are not playing"),
    );
    const blurCheckbox = blurLabel?.querySelector<HTMLInputElement>(
      'input[type="checkbox"]',
    );
    expect(blurCheckbox?.checked).toBe(false);

    await user.click(blurCheckbox!);
    expect(setLyricsBlurInactive).toHaveBeenCalledWith(true);
  });

  test("automatic lyrics updates default on and have a keyboard toggle and description", async () => {
    const harness = await createInitializedSettingsHarness();
    const write = vi.spyOn(harness.backend.settings, "setAutoUpdateLyrics");
    act(() => {
      root.render(
        <SettingsControllerContext value={harness.controller}>
          <SettingsGeneralSection />
        </SettingsControllerContext>,
      );
    });
    const label = [...container.querySelectorAll("label")].find((label) =>
      label.textContent?.includes("Automatically update lyrics online"),
    );
    const checkbox = label?.querySelector<HTMLInputElement>(
      'input[type="checkbox"]',
    );
    expect(checkbox?.checked).toBe(true);
    expect(checkbox?.getAttribute("aria-describedby")).toBe(
      "settings-auto-update-lyrics-description",
    );
    checkbox?.focus();
    await user.keyboard(" ");
    expect(write).toHaveBeenCalledWith(false);
    expect(harness.view().preferences.autoUpdateLyrics).toBe(false);
  });

  test("automatic lyrics updates show the persisted disabled state", async () => {
    const harness = await createInitializedSettingsHarness({
      settings: { auto_update_lyrics: false },
    });
    act(() => {
      root.render(
        <SettingsControllerContext value={harness.controller}>
          <SettingsGeneralSection />
        </SettingsControllerContext>,
      );
    });
    const checkbox = container.querySelector<HTMLInputElement>(
      '[aria-describedby="settings-auto-update-lyrics-description"]',
    );
    expect(checkbox?.checked).toBe(false);
  });

  test("automatic lyrics updates cannot be changed before settings initialize", () => {
    const harness = createSettingsHarness();
    act(() => {
      root.render(
        <SettingsControllerContext value={harness.controller}>
          <SettingsGeneralSection />
        </SettingsControllerContext>,
      );
    });
    const checkbox = container.querySelector<HTMLInputElement>(
      '[aria-describedby="settings-auto-update-lyrics-description"]',
    );
    expect(checkbox?.disabled).toBe(true);
  });
});
