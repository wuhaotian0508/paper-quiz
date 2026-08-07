"use client";

import { useCallback, useEffect, useState } from "react";
import {
  DEFAULT_LOCALE,
  LOCALE_CHANGED_EVENT,
  LOCALE_STORAGE_KEY,
  readLocale,
  translate,
  type Locale,
  type MessageKey,
} from "@/lib/i18n";

export type Translate = (key: MessageKey, params?: Record<string, string | number>) => string;

/**
 * Every consumer starts on the default locale and adopts the stored one in an effect,
 * so server and first client render always agree. The custom event keeps sibling
 * components in step within a tab; `storage` covers other tabs.
 */
export function useLocale(): { locale: Locale; setLocale: (next: Locale) => void; t: Translate } {
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);

  useEffect(() => {
    const sync = () => setLocaleState(readLocale(window.localStorage.getItem(LOCALE_STORAGE_KEY)));
    sync();
    window.addEventListener(LOCALE_CHANGED_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(LOCALE_CHANGED_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale === "zh" ? "zh-CN" : "en";
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, next);
    window.dispatchEvent(new Event(LOCALE_CHANGED_EVENT));
  }, []);

  const t = useCallback<Translate>((key, params) => translate(locale, key, params), [locale]);

  return { locale, setLocale, t };
}
