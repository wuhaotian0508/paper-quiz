"use client";

import { useEffect, useState } from "react";
import { AuthMenu } from "@/components/auth-menu";
import { createFeedbackHref } from "@/lib/feedback";
import { MISTAKE_BOOK_KEY, readMistakes } from "@/lib/mistake-book";
import { readSessions, STUDY_HISTORY_KEY } from "@/lib/study-history";
import { groupStudyMaterials } from "@/lib/study-material";
import {
  readStudyLibrary,
  STUDY_LIBRARY_KEY,
  STUDY_LIBRARY_UPDATED_EVENT,
  STUDY_MATERIAL_OPEN_EVENT,
  type StudyLibraryRecord,
} from "@/lib/study-library";
import { safeStorageSet } from "@/lib/request-validation";
import { useLocale } from "@/hooks/use-locale";
import { localeLabels, nextLocale, type MessageKey } from "@/lib/i18n";

const navigationItems = [
  { id: "dashboard", labelKey: "nav.dashboard", icon: "D" },
  { id: "quiz-lab", labelKey: "nav.quizLab", icon: "Q" },
  { id: "review-sheets", labelKey: "nav.reviewSheets", icon: "R" },
  { id: "mistake-book", labelKey: "nav.mistakeBook", icon: "!" },
  { id: "progress", labelKey: "nav.calendar", icon: "C" },
  { id: "history", labelKey: "nav.history", icon: "H" },
] as const satisfies readonly { id: string; labelKey: MessageKey; icon: string }[];

type NavigationId = (typeof navigationItems)[number]["id"];

const navigationIds = new Set<NavigationId>(navigationItems.map((item) => item.id));
const themeStorageKey = "paper-quiz-theme";

type Theme = "light" | "dark";

function selectedNavigationId(hash: string): NavigationId {
  const id = hash.replace("#", "") as NavigationId;
  return navigationIds.has(id) ? id : "dashboard";
}

export function DashboardNavigation({ authError = false }: { authError?: boolean }) {
  const [activeId, setActiveId] = useState<NavigationId>("dashboard");
  const [theme, setTheme] = useState<Theme | null>(null);
  const [library, setLibrary] = useState<StudyLibraryRecord[]>([]);
  const { locale, setLocale, t } = useLocale();

  useEffect(() => {
    const syncWithLocation = () => setActiveId(selectedNavigationId(window.location.hash));

    syncWithLocation();
    window.addEventListener("hashchange", syncWithLocation);
    return () => window.removeEventListener("hashchange", syncWithLocation);
  }, []);

  useEffect(() => {
    const syncLibrary = () => {
      const stored = readStudyLibrary(window.localStorage.getItem(STUDY_LIBRARY_KEY));
      const knownIds = new Set(stored.map((item) => item.id));
      const derived = groupStudyMaterials(
        readSessions(window.localStorage.getItem(STUDY_HISTORY_KEY)),
        readMistakes(window.localStorage.getItem(MISTAKE_BOOK_KEY)),
      )
        .filter((material) => material.id && !knownIds.has(material.id))
        .map((material) => ({
          id: material.id,
          name: material.name,
          uploadedAt: material.lastPracticedAt || new Date().toISOString(),
          lastOpenedAt: "",
        }));
      const next = [...stored, ...derived].slice(0, 50);
      if (derived.length) safeStorageSet(STUDY_LIBRARY_KEY, JSON.stringify(next));
      setLibrary(next);
    };
    syncLibrary();
    window.addEventListener("storage", syncLibrary);
    window.addEventListener(STUDY_LIBRARY_UPDATED_EVENT, syncLibrary);
    return () => {
      window.removeEventListener("storage", syncLibrary);
      window.removeEventListener(STUDY_LIBRARY_UPDATED_EVENT, syncLibrary);
    };
  }, []);

  useEffect(() => {
    const savedTheme = window.localStorage.getItem(themeStorageKey);
    const systemTheme = window.matchMedia?.("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";

    setTheme(savedTheme === "dark" || savedTheme === "light" ? savedTheme : systemTheme);
  }, []);

  useEffect(() => {
    if (theme) {
      document.documentElement.dataset.theme = theme;
    }
  }, [theme]);

  const toggleTheme = () => {
    setTheme((currentTheme) => {
      const nextTheme = currentTheme === "dark" ? "light" : "dark";
      window.localStorage.setItem(themeStorageKey, nextTheme);
      return nextTheme;
    });
  };

  return (
    <aside className="app-sidebar">
      <a className="brand-mark" href="#dashboard" onClick={() => setActiveId("dashboard")}>
        <span>*</span> {t("nav.brand")}
      </a>
      <nav className="sidebar-nav" aria-label={t("nav.mainNavigation")}>
        {navigationItems.map((item) => (
          <a
            aria-current={activeId === item.id ? "page" : undefined}
            href={`#${item.id}`}
            key={item.id}
            onClick={() => setActiveId(item.id)}
          >
            <span aria-hidden="true">{item.icon}</span> {t(item.labelKey)}
          </a>
        ))}
      </nav>
      <section className="sidebar-library" aria-labelledby="sidebar-library-heading">
        <div className="sidebar-library-heading">
          <h2 id="sidebar-library-heading">{t("nav.yourLibrary")}</h2>
          <a href="#quiz-lab" aria-label={t("nav.new")}>
            {t("nav.new")}
          </a>
        </div>
        {library.length ? (
          <div className="sidebar-library-list">
            {library.slice(0, 4).map((item) => (
              <a
                href="#history"
                key={item.id}
                onClick={(event) => {
                  event.preventDefault();
                  window.dispatchEvent(new CustomEvent(STUDY_MATERIAL_OPEN_EVENT, { detail: item.id }));
                }}
                title={t("nav.openLibrary", { name: item.name })}
              >
                <span aria-hidden="true">PDF</span>
                <strong>{item.name}</strong>
              </a>
            ))}
            {library.length > 4 ? (
              <a className="sidebar-library-view-all" href="#history">
                {t("nav.viewAll")}
              </a>
            ) : null}
          </div>
        ) : (
          <p className="sidebar-library-empty">{t("nav.libraryEmpty")}</p>
        )}
      </section>
      <div className="sidebar-utilities">
        <a className="sidebar-utility-link" href="#help">
          <span aria-hidden="true">?</span> {t("nav.help")}
        </a>
        <a className="sidebar-utility-link" href={createFeedbackHref()}>
          <span aria-hidden="true">@</span> {t("nav.feedback")}
        </a>
        <button
          aria-label={theme === "dark" ? t("nav.switchToLight") : t("nav.switchToDark")}
          className="sidebar-theme-toggle"
          onClick={toggleTheme}
          type="button"
        >
          <span aria-hidden="true">{theme === "dark" ? "L" : "D"}</span>
          {theme === "dark" ? t("nav.lightMode") : t("nav.darkMode")}
        </button>
        <button
          aria-label={locale === "en" ? t("nav.switchToChinese") : t("nav.switchToEnglish")}
          className="sidebar-locale-toggle"
          onClick={() => setLocale(nextLocale(locale))}
          type="button"
        >
          <span aria-hidden="true">文</span>
          {localeLabels[nextLocale(locale)]}
        </button>
        <div className="sidebar-account">
          <AuthMenu authError={authError} />
        </div>
      </div>
    </aside>
  );
}
