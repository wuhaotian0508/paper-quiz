import { en } from "@/lib/i18n-en";
import { zh } from "@/lib/i18n-zh";

export type Locale = "en" | "zh";

export const LOCALE_STORAGE_KEY = "paper-quiz-locale";
export const LOCALE_CHANGED_EVENT = "paper-quiz-locale-changed";
export const DEFAULT_LOCALE: Locale = "en";

export const localeLabels: Record<Locale, string> = { en: "English", zh: "中文" };

export type MessageKey = keyof typeof en;
export type Messages = Record<MessageKey, string>;

const messages: Record<Locale, Messages> = { en, zh };

export function readLocale(value: string | null): Locale {
  return value === "zh" || value === "en" ? value : DEFAULT_LOCALE;
}

/** The other locale, so a two-language toggle never has to name it at the call site. */
export function nextLocale(locale: Locale): Locale {
  return locale === "en" ? "zh" : "en";
}

export function translate(
  locale: Locale,
  key: MessageKey,
  params?: Record<string, string | number>,
): string {
  const template = messages[locale][key] ?? en[key] ?? key;
  if (!params) return template;
  return template.replaceAll(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
}

/**
 * The language the model should write user-visible quiz and review fields in. Kept
 * next to the UI locale so a single toggle drives both the chrome and generated text.
 */
export function generationLanguage(locale: Locale): string {
  return locale === "zh" ? "Simplified Chinese" : "English";
}
