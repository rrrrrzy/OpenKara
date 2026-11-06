import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSettings } from "./SettingsController.context";

export function SettingsBackdropControls() {
  const { t } = useTranslation();
  const { view, preferences } = useSettings();
  const {
    coverArtBackdrop,
    coverArtBackdropBlurPx,
    coverArtBackdropOpacityPercent,
  } = view.preferences;
  const [themeDefaultOpacity, setThemeDefaultOpacity] = useState(() =>
    document.documentElement.dataset.theme === "light" ? 55 : 40,
  );

  useEffect(() => {
    const update = () =>
      setThemeDefaultOpacity(
        document.documentElement.dataset.theme === "light" ? 55 : 40,
      );
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => observer.disconnect();
  }, []);

  useEffect(
    () => () => {
      void preferences.flushCoverArtBackdropStyle();
    },
    [preferences],
  );

  const disabled = view.isInitializing || !coverArtBackdrop;
  const opacity = coverArtBackdropOpacityPercent ?? themeDefaultOpacity;
  const flush = () => {
    void preferences.flushCoverArtBackdropStyle();
  };
  const controlClass =
    "min-h-6 w-full accent-[var(--color-accent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus-ring)] disabled:opacity-50";

  return (
    <div className="space-y-3 pt-2">
      <div>
        <div className="flex items-center justify-between text-[12px] text-[var(--color-text-dim)]">
          <label htmlFor="settings-backdrop-blur">
            {t("settings.coverArtBackdrop.blur")}
          </label>
          <output htmlFor="settings-backdrop-blur">
            {coverArtBackdropBlurPx} px
          </output>
        </div>
        <input
          id="settings-backdrop-blur"
          type="range"
          min={0}
          max={80}
          step={1}
          value={coverArtBackdropBlurPx}
          disabled={disabled}
          className={controlClass}
          aria-valuetext={`${coverArtBackdropBlurPx} px`}
          onChange={(event) => {
            void preferences.set({
              coverArtBackdropBlurPx: Number(event.target.value),
            });
          }}
          onPointerUp={flush}
          onPointerCancel={flush}
          onKeyUp={flush}
          onBlur={flush}
        />
      </div>
      <div>
        <div className="flex items-center justify-between text-[12px] text-[var(--color-text-dim)]">
          <label htmlFor="settings-backdrop-opacity">
            {t("settings.coverArtBackdrop.opacity")}
          </label>
          <output htmlFor="settings-backdrop-opacity">{opacity}%</output>
        </div>
        <input
          id="settings-backdrop-opacity"
          type="range"
          min={0}
          max={100}
          step={1}
          value={opacity}
          disabled={disabled}
          className={controlClass}
          aria-describedby="settings-backdrop-opacity-description"
          aria-valuetext={`${opacity}%`}
          onChange={(event) => {
            void preferences.set({
              coverArtBackdropOpacityPercent: Number(event.target.value),
            });
          }}
          onPointerUp={flush}
          onPointerCancel={flush}
          onKeyUp={flush}
          onBlur={flush}
        />
        <p
          id="settings-backdrop-opacity-description"
          className="text-[11px] text-[var(--color-text-dim)]"
        >
          {t("settings.coverArtBackdrop.opacityDescription")}
        </p>
      </div>
      <button
        type="button"
        disabled={disabled}
        className="min-h-6 rounded px-1 text-[12px] text-[var(--color-control-primary)] hover:bg-[var(--color-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus-ring)] disabled:opacity-50"
        onClick={() => {
          void preferences.set({
            coverArtBackdropBlurPx: 40,
            coverArtBackdropOpacityPercent: null,
          });
          flush();
        }}
      >
        {t("settings.coverArtBackdrop.reset")}
      </button>
    </div>
  );
}
