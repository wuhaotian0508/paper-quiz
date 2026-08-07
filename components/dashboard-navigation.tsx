"use client";

import { useEffect, useMemo, useState } from "react";
import { AuthMenu } from "@/components/auth-menu";
import { createFeedbackHref } from "@/lib/feedback";
import { MISTAKE_BOOK_KEY, readMistakes } from "@/lib/mistake-book";
import { readSessions, STUDY_HISTORY_KEY } from "@/lib/study-history";
import { groupStudyMaterials } from "@/lib/study-material";
import {
  createLibraryRecord,
  libraryDate,
  readStudyLibrary,
  STUDY_LIBRARY_KEY,
  STUDY_LIBRARY_UPDATED_EVENT,
  STUDY_MATERIAL_OPEN_EVENT,
  type StudyLibraryRecord,
} from "@/lib/study-library";
import { groupBySubject } from "@/lib/subject";
import { safeStorageSet } from "@/lib/request-validation";
import { useLocale } from "@/hooks/use-locale";
import { localeLabels, nextLocale, type MessageKey } from "@/lib/i18n";

/**
 * One entry per destination. `quiz-lab` used to sit here pointing at the same view as
 * `dashboard`, and `review-sheets`/`history` rendered the same materials twice in two
 * skins; both pairs are now single entries.
 */
const navigationItems = [
  { id: "dashboard", labelKey: "nav.dashboard", icon: "D" },
  { id: "library", labelKey: "nav.library", icon: "L" },
  { id: "mistake-book", labelKey: "nav.mistakeBook", icon: "!" },
  { id: "progress", labelKey: "nav.calendar", icon: "C" },
] as const satisfies readonly { id: string; labelKey: MessageKey; icon: string }[];

type NavigationId = (typeof navigationItems)[number]["id"];

/**
 * How many of a course's files the sidebar lists before it offers to show the rest. Four
 * keeps a folder glanceable — the sidebar is a "jump back in" list, and the Library page is
 * where a student goes to see everything.
 */
const FILES_PER_FOLDER = 4;

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
  // Both are lists of subjects, and both are the exception rather than the rule: folders open
  // and capped is the default, so an empty list on first load is the right starting state.
  const [collapsedFolders, setCollapsedFolders] = useState<string[]>([]);
  const [uncappedFolders, setUncappedFolders] = useState<string[]>([]);
  const { locale, setLocale, t } = useLocale();

  /**
   * The sidebar mirrors the Library page's courses, so a student sees the same folders in
   * both places. Files are sorted before grouping, which leaves each folder in
   * most-recent-first order.
   */
  const folders = useMemo(
    () =>
      groupBySubject(
        [...library].sort((left, right) => libraryDate(right).localeCompare(libraryDate(left))),
        (record) => record.subject,
      ),
    [library],
  );

  const toggle = (set: (update: (previous: string[]) => string[]) => void, subject: string) =>
    set((previous) =>
      previous.includes(subject)
        ? previous.filter((name) => name !== subject)
        : [...previous, subject],
    );

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
        .map((material) =>
          createLibraryRecord({
            id: material.id,
            name: material.name,
            uploadedAt: material.lastPracticedAt || new Date().toISOString(),
          }),
        );
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
          <a href="#dashboard" aria-label={t("nav.new")}>
            {t("nav.new")}
          </a>
        </div>
        {folders.length ? (
          <div className="sidebar-library-folders">
            {folders.map(({ subject, items }) => {
              const collapsed = collapsedFolders.includes(subject);
              const uncapped = uncappedFolders.includes(subject);
              const name = subject || t("library.unassigned");
              return (
                <div className="sidebar-library-folder" key={subject || "unassigned"}>
                  <h3 className="sidebar-library-folder-name">
                    <button
                      aria-expanded={!collapsed}
                      className="sidebar-library-folder-toggle"
                      onClick={() => toggle(setCollapsedFolders, subject)}
                      type="button"
                    >
                      <span aria-hidden="true" className="sidebar-library-folder-caret" />
                      <span aria-hidden="true" className="sidebar-library-folder-icon" />
                      <span className="sidebar-library-folder-label">{name}</span>
                    </button>
                  </h3>
                  {/*
                    A collapsed folder drops its files from the tree rather than hiding them
                    with CSS, so they leave the tab order and the screen reader's list too.
                    Whether it was uncapped is remembered, and comes back on re-opening.
                  */}
                  {collapsed ? null : (
                    <>
                      <div className="sidebar-library-list">
                        {(uncapped ? items : items.slice(0, FILES_PER_FOLDER)).map((item) => (
                          <a
                            href="#library"
                            key={item.id}
                            onClick={(event) => {
                              event.preventDefault();
                              window.dispatchEvent(
                                new CustomEvent(STUDY_MATERIAL_OPEN_EVENT, { detail: item.id }),
                              );
                            }}
                            title={t("nav.openLibrary", { name: item.name })}
                          >
                            <strong>{item.name}</strong>
                          </a>
                        ))}
                      </div>
                      {items.length > FILES_PER_FOLDER ? (
                        <button
                          // The visible label repeats in every folder, so the course names the target.
                          aria-label={t(uncapped ? "nav.showLessAria" : "nav.showMoreAria", { name })}
                          className="sidebar-library-more"
                          onClick={() => toggle(setUncappedFolders, subject)}
                          type="button"
                        >
                          {uncapped ? t("nav.showLess") : t("nav.showMore")}
                        </button>
                      ) : null}
                    </>
                  )}
                </div>
              );
            })}
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

