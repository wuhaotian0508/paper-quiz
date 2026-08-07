import { describe, expect, it } from "vitest";
import { en } from "@/lib/i18n-en";
import { zh } from "@/lib/i18n-zh";
import {
  DEFAULT_LOCALE,
  generationLanguage,
  nextLocale,
  readLocale,
  translate,
} from "@/lib/i18n";
import { buildQuizInstructions } from "@/lib/quiz-prompt";
import { buildExamReviewInstructions } from "@/lib/exam-review";

describe("readLocale", () => {
  it("falls back to the default for unknown or missing values", () => {
    expect(readLocale(null)).toBe("en");
    expect(readLocale("")).toBe("en");
    expect(readLocale("fr")).toBe("en");
    expect(DEFAULT_LOCALE).toBe("en");
  });

  it("accepts the supported locales", () => {
    expect(readLocale("en")).toBe("en");
    expect(readLocale("zh")).toBe("zh");
  });
});

it("toggles between the two locales", () => {
  expect(nextLocale("en")).toBe("zh");
  expect(nextLocale("zh")).toBe("en");
});

describe("translate", () => {
  it("returns the locale's copy", () => {
    expect(translate("en", "nav.dashboard")).toBe("Dashboard");
    expect(translate("zh", "nav.dashboard")).toBe("主页");
  });

  it("interpolates named parameters", () => {
    expect(translate("en", "results.correctOf", { correct: 3, total: 5 })).toBe("Correct 3 / 5");
    expect(translate("zh", "results.correctOf", { correct: 3, total: 5 })).toBe("答对 3 / 5");
  });

  it("leaves a placeholder alone when no matching parameter is supplied", () => {
    expect(translate("en", "nav.openLibrary", {})).toBe("Open {name} library");
  });
});

it("keeps both dictionaries in step", () => {
  expect(Object.keys(zh).sort()).toEqual(Object.keys(en).sort());
  const untranslated = Object.keys(en).filter(
    (key) => en[key as keyof typeof en] === zh[key as keyof typeof zh],
  );
  // Brand names and a couple of deliberate cross-language labels stay identical.
  expect(untranslated).toEqual([
    "nav.brand",
    "nav.switchToChinese",
    "nav.switchToEnglish",
    "login.emailPlaceholder",
  ]);
});

it("has no empty translations", () => {
  expect(Object.entries(zh).filter(([, value]) => !value.trim())).toEqual([]);
  expect(Object.entries(en).filter(([, value]) => !String(value).trim())).toEqual([]);
});

describe("generation language", () => {
  it("names the language the model must write in", () => {
    expect(generationLanguage("en")).toBe("English");
    expect(generationLanguage("zh")).toBe("Simplified Chinese");
  });

  it("carries the locale into the quiz prompt", () => {
    const settings = { questions: [], difficulty: "mixed" as const };
    expect(buildQuizInstructions({ ...settings, locale: "zh" })).toContain(
      "Write every user-visible field in Simplified Chinese",
    );
    expect(buildQuizInstructions(settings)).toContain(
      "Write every user-visible field in English",
    );
  });

  it("carries the locale into the review-sheet prompt", () => {
    expect(buildExamReviewInstructions("zh")).toContain(
      "Write every user-visible field in Simplified Chinese",
    );
    expect(buildExamReviewInstructions()).toContain("Write every user-visible field in English");
  });
});
