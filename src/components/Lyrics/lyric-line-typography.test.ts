import { describe, expect, test } from "vite-plus/test";
import {
  CENTERED_BG_FONT_SIZE,
  CENTERED_LINE_FONT_SIZE_BASE,
  CENTERED_ROMAN_FONT_SIZE,
  evaluateCenteredLineFontSizePx,
  getCenteredLineFontSize,
  getLyricsTextSizeClass,
  getLyricsSecondaryTextSizeClass,
  getLyricsRomanTextSizeClass,
  shouldEmphasizeWord,
  wordTokenGap,
} from "./lyric-line-typography";

describe("wordTokenGap", () => {
  test("does not insert a space between CJK syllables", () => {
    expect(wordTokenGap("止", "め")).toBe("");
    expect(wordTokenGap("喪失", "の")).toBe("");
  });

  test("inserts a space between Latin words", () => {
    expect(wordTokenGap("Can", "you")).toBe(" ");
    expect(wordTokenGap("last", "kiss?")).toBe(" ");
  });

  test("still emits a visible gap after word stacks trim edge spaces", () => {
    expect(wordTokenGap("Can ", "you")).toBe(" ");
    expect(wordTokenGap("Can", " you")).toBe(" ");
  });
});

describe("centered focus type scale", () => {
  test("puts a clamped display size on the line, not a rem step", () => {
    expect(getCenteredLineFontSize(0)).toBe(CENTERED_LINE_FONT_SIZE_BASE);
    expect(CENTERED_LINE_FONT_SIZE_BASE).toContain("clamp(");
    expect(CENTERED_LINE_FONT_SIZE_BASE).not.toContain("5vh");
    expect(getCenteredLineFontSize(-2)).toBe(
      `calc(${CENTERED_LINE_FONT_SIZE_BASE} * 0.76)`,
    );
    expect(getCenteredLineFontSize(2)).toBe(
      `calc(${CENTERED_LINE_FONT_SIZE_BASE} * 1.28)`,
    );
  });

  test("clamps the display size at small, mid, and large viewports", () => {
    expect(evaluateCenteredLineFontSizePx(0, 320, 480)).toBeCloseTo(34.4, 5);
    expect(evaluateCenteredLineFontSizePx(0, 1600, 900)).toBeCloseTo(43.4, 5);
    expect(evaluateCenteredLineFontSizePx(0, 1920, 1080)).toBeCloseTo(48, 5);
    expect(evaluateCenteredLineFontSizePx(-2, 1920, 1080)).toBeCloseTo(
      48 * 0.76,
      5,
    );
  });

  test("XXL enlarges centered lyrics at every supported viewport and clamps higher steps", () => {
    for (const [width, height] of [
      [320, 480],
      [1280, 720],
      [1920, 1080],
    ]) {
      const xxl = evaluateCenteredLineFontSizePx(3, width, height);
      expect(xxl).toBeCloseTo(
        evaluateCenteredLineFontSizePx(0, width, height) * 1.42,
      );
      expect(xxl).toBeGreaterThan(
        evaluateCenteredLineFontSizePx(2, width, height),
      );
      expect(evaluateCenteredLineFontSizePx(4, width, height)).toBe(xxl);
    }
    expect(getCenteredLineFontSize(3)).toBe(
      `calc(${CENTERED_LINE_FONT_SIZE_BASE} * 1.42)`,
    );
  });

  test("XXL increases standard, audience, secondary, and roman type scales", () => {
    expect(getLyricsTextSizeClass("standard", 3)).toBe(
      "text-5xl font-semibold tracking-tight md:text-6xl xl:text-7xl",
    );
    expect(getLyricsTextSizeClass("audience", 3)).toBe(
      "text-7xl font-bold tracking-tight md:text-9xl xl:text-9xl",
    );
    expect(getLyricsSecondaryTextSizeClass(3)).toBe(
      "text-2xl md:text-3xl xl:text-4xl",
    );
    expect(getLyricsRomanTextSizeClass(3)).toBe(
      "text-4xl font-medium tracking-tight md:text-5xl xl:text-6xl",
    );
    expect(getLyricsTextSizeClass("standard", 4)).toBe(
      getLyricsTextSizeClass("standard", 3),
    );
  });

  test("keeps roman and background as em of the line with a readable floor", () => {
    expect(CENTERED_ROMAN_FONT_SIZE).toBe("max(0.5em, 10px)");
    expect(CENTERED_BG_FONT_SIZE).toBe("max(0.7em, 10px)");
  });
});

describe("shouldEmphasizeWord", () => {
  test("marks a long CJK syllable and a short long-held Latin word", () => {
    expect(shouldEmphasizeWord({ text: "忘", time_ms: 0, end_ms: 1200 })).toBe(
      true,
    );
    expect(
      shouldEmphasizeWord({ text: "hello", time_ms: 0, end_ms: 1200 }),
    ).toBe(true);
    expect(shouldEmphasizeWord({ text: "a", time_ms: 0, end_ms: 1200 })).toBe(
      false,
    );
    expect(shouldEmphasizeWord({ text: "忘", time_ms: 0, end_ms: 400 })).toBe(
      false,
    );
  });
});
