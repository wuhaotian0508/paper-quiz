"use client";

import { useEffect, useMemo, useState } from "react";
import { AuthMenu } from "@/components/auth-menu";
import { createFeedbackHref } from "@/lib/feedback";
import { MISTAKE_BOOK_KEY, readMistakes } from "@/lib/mistake-book";
import { readSessions, STUDY_HISTORY_KEY } from "@/lib/study-history";
import { groupStudyMaterials } from "@/lib/study-material";
import {
  addStudySubject,
  createLibraryRecord,
  libraryDate,
  libraryFolders,
  readStudyLibrary,
  readStudySubjects,
  removeLibrarySubject,
  removeStudySubject,
  renameLibrarySubject,
  renameStudySubject,
  setLibrarySubject,
  STUDY_LIBRARY_KEY,
  STUDY_LIBRARY_UPDATED_EVENT,
  STUDY_MATERIAL_OPEN_EVENT,
  STUDY_SUBJECTS_KEY,
  type StudyLibraryRecord,
} from "@/lib/study-library";
import { groupBySubject, MAX_SUBJECT_CHARS, UNASSIGNED_SUBJECT } from "@/lib/subject";
import { safeStorageSet, STORAGE_WRITE_FAILED_EVENT } from "@/lib/request-validation";
import { CONTACTS_UNREAD_EVENT, unreadTotal } from "@/lib/contacts";
import { listContacts, type ContactsClient } from "@/lib/contacts-client";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
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
  { id: "contacts", labelKey: "nav.contacts", icon: "F" },
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
  /** Course being renamed, and the folder a dragged file is currently over. */
  const [editingSubject, setEditingSubject] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [dragOverSubject, setDragOverSubject] = useState<string | null>(null);
  /** Courses created by hand, including any still empty, and the new-course draft. */
  const [subjects, setSubjects] = useState<string[]>([]);
  const [newSubject, setNewSubject] = useState<string | null>(null);
  /** Set once a browser refuses a write, and never cleared: nothing has been saved since. */
  const [storageFull, setStorageFull] = useState(false);
  /** Unread direct messages, drawn on the Contacts entry. */
  const [unread, setUnread] = useState(0);
  const { locale, setLocale, t } = useLocale();

  /**
   * The sidebar mirrors the Library page's courses, so a student sees the same folders in
   * both places. Files are sorted before grouping, which leaves each folder in
   * most-recent-first order.
   */
  const folders = useMemo(
    () =>
      libraryFolders(
        groupBySubject(
          [...library].sort((left, right) => libraryDate(right).localeCompare(libraryDate(left))),
          (record) => record.subject,
        ),
        subjects,
      ),
    [library, subjects],
  );

  const toggle = (set: (update: (previous: string[]) => string[]) => void, subject: string) =>
    set((previous) =>
      previous.includes(subject)
        ? previous.filter((name) => name !== subject)
        : [...previous, subject],
    );

  /**
   * The sidebar owns no state the workspace can see, so every edit is written straight to
   * storage and announced. The workspace listens for the same event and re-reads, which
   * stops its copy going stale and overwriting this on its next save.
   */
  const writeLibrary = (next: StudyLibraryRecord[]) => {
    setLibrary(next);
    safeStorageSet(STUDY_LIBRARY_KEY, JSON.stringify(next));
    window.dispatchEvent(new Event(STUDY_LIBRARY_UPDATED_EVENT));
  };

  const writeSubjects = (next: string[]) => {
    setSubjects(next);
    safeStorageSet(STUDY_SUBJECTS_KEY, JSON.stringify(next));
  };

  const createSubject = () => {
    const name = (newSubject ?? "").trim();
    setNewSubject(null);
    if (name) writeSubjects(addStudySubject(subjects, name));
  };

  const dropOnFolder = (subject: string, materialId: string) => {
    setDragOverSubject(null);
    if (!materialId) return;
    const record = library.find((item) => item.id === materialId);
    if (!record || record.subject === subject) return;
    writeLibrary(setLibrarySubject(library, materialId, subject));
  };

  const startRename = (subject: string) => {
    // Unassigned is the absence of a course, not one of them: there is no name to change
    // and nothing to delete, so it stays a plain folder.
    if (subject === UNASSIGNED_SUBJECT) return;
    setEditingSubject(subject);
    setDraftName(subject);
  };

  const commitRename = () => {
    if (editingSubject === null) return;
    const next = draftName.trim();
    // An emptied name would silently unassign every file in the folder, which is the delete
    // action, not the rename one. Cancel instead and leave the folder as it was.
    if (next && next !== editingSubject) {
      writeLibrary(renameLibrarySubject(library, editingSubject, next));
      // A folder can be created by hand, derived from its files, or both, so the created
      // list is renamed too — otherwise an empty course reappears under its old name.
      writeSubjects(addStudySubject(renameStudySubject(subjects, editingSubject, next), next));
    }
    setEditingSubject(null);
    setDraftName("");
  };

  const deleteFolder = (subject: string) => {
    writeLibrary(removeLibrarySubject(library, subject));
    writeSubjects(removeStudySubject(subjects, subject));
    setEditingSubject(null);
    setDraftName("");
  };

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
      setSubjects(readStudySubjects(window.localStorage.getItem(STUDY_SUBJECTS_KEY)));
    };
    syncLibrary();
    window.addEventListener("storage", syncLibrary);
    window.addEventListener(STUDY_LIBRARY_UPDATED_EVENT, syncLibrary);
    return () => {
      window.removeEventListener("storage", syncLibrary);
      window.removeEventListener(STUDY_LIBRARY_UPDATED_EVENT, syncLibrary);
    };
  }, []);

  /**
   * The sidebar is the one surface mounted on every view, so the warning lives here rather
   * than in the workspace, whose own error line is consumed by the current action and is
   * gone the moment the learner navigates away.
   */
  useEffect(() => {
    const warn = () => setStorageFull(true);
    window.addEventListener(STORAGE_WRITE_FAILED_EVENT, warn);
    return () => window.removeEventListener(STORAGE_WRITE_FAILED_EVENT, warn);
  }, []);

  /**
   * The unread badge: read on mount, again on every navigation, and updated the moment the
   * contacts page announces a new total. Deliberately no timer — messages here are not
   * realtime, and a sidebar polling in the background on every page would say otherwise.
   */
  useEffect(() => {
    let client: ContactsClient;
    try {
      client = getSupabaseBrowserClient() as unknown as ContactsClient;
    } catch {
      // Supabase unconfigured: the rest of the sidebar still works, the badge never appears.
      return;
    }

    let active = true;
    const read = async () => {
      try {
        const list = await listContacts(client);
        if (active) setUnread(unreadTotal(list.contacts));
      } catch {
        // Signed out, or offline. Leaving the last known count is better than flashing zero.
      }
    };
    const announce = (event: Event) => {
      const total = (event as CustomEvent<unknown>).detail;
      if (typeof total === "number") setUnread(total);
    };

    void read();
    window.addEventListener("hashchange", read);
    window.addEventListener(CONTACTS_UNREAD_EVENT, announce);
    return () => {
      active = false;
      window.removeEventListener("hashchange", read);
      window.removeEventListener(CONTACTS_UNREAD_EVENT, announce);
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
      {storageFull && (
        <p className="sidebar-storage-warning" role="alert">
          {t("storage.full")}
        </p>
      )}
      <nav className="sidebar-nav" aria-label={t("nav.mainNavigation")}>
        {navigationItems.map((item) => (
          <a
            aria-current={activeId === item.id ? "page" : undefined}
            href={`#${item.id}`}
            key={item.id}
            onClick={() => setActiveId(item.id)}
          >
            <span aria-hidden="true">{item.icon}</span> {t(item.labelKey)}
            {item.id === "contacts" && unread ? (
              <span
                aria-label={t("nav.contactsUnread", { count: unread })}
                className="sidebar-nav-badge"
              >
                {unread}
              </span>
            ) : null}
          </a>
        ))}
      </nav>
      <section className="sidebar-library" aria-labelledby="sidebar-library-heading">
        <div className="sidebar-library-heading">
          <h2 id="sidebar-library-heading">{t("nav.yourLibrary")}</h2>
          <button
            aria-label={t("nav.newCourseAria")}
            className="sidebar-library-new"
            onClick={() => setNewSubject("")}
            type="button"
          >
            {t("nav.new")}
          </button>
        </div>
        {newSubject !== null ? (
          <div className="sidebar-library-folder-edit">
            <input
              aria-label={t("nav.newCourseNameAria")}
              autoFocus
              maxLength={MAX_SUBJECT_CHARS}
              onBlur={createSubject}
              onChange={(event) => setNewSubject(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") createSubject();
                if (event.key === "Escape") setNewSubject(null);
              }}
              placeholder={t("nav.newCoursePlaceholder")}
              value={newSubject}
            />
          </div>
        ) : null}
        {folders.length ? (
          <div className="sidebar-library-folders">
            {folders.map(({ subject, items }) => {
              const collapsed = collapsedFolders.includes(subject);
              const uncapped = uncappedFolders.includes(subject);
              const name = subject || t("library.unassigned");
              return (
                <div
                  className={`sidebar-library-folder ${dragOverSubject === subject ? "is-drop-target" : ""}`}
                  key={subject || "unassigned"}
                  onDragOver={(event) => {
                    // Without preventDefault the browser refuses the drop outright.
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "move";
                    setDragOverSubject(subject);
                  }}
                  onDragLeave={(event) => {
                    // Ignore the events fired while crossing this folder's own children.
                    if (!event.currentTarget.contains(event.relatedTarget as Node | null))
                      setDragOverSubject(null);
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    dropOnFolder(subject, event.dataTransfer.getData("text/plain"));
                  }}
                >
                  {editingSubject === subject ? (
                    <div className="sidebar-library-folder-edit">
                      <input
                        aria-label={t("nav.folderNameAria")}
                        autoFocus
                        maxLength={MAX_SUBJECT_CHARS}
                        onBlur={commitRename}
                        onChange={(event) => setDraftName(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") commitRename();
                          if (event.key === "Escape") {
                            setEditingSubject(null);
                            setDraftName("");
                          }
                        }}
                        value={draftName}
                      />
                      <button
                        aria-label={t("nav.deleteFolderAria", { name })}
                        className="sidebar-library-folder-delete"
                        // onMouseDown, not onClick: the input's blur commits the rename and
                        // unmounts this button before a click would ever land on it.
                        onMouseDown={(event) => {
                          event.preventDefault();
                          deleteFolder(subject);
                        }}
                        type="button"
                      >
                        {t("nav.deleteFolder")}
                      </button>
                    </div>
                  ) : (
                    <h3 className="sidebar-library-folder-name">
                      <button
                        aria-expanded={!collapsed}
                        className="sidebar-library-folder-toggle"
                        onClick={() => toggle(setCollapsedFolders, subject)}
                        onDoubleClick={() => startRename(subject)}
                        // Double-click cannot be reached from a keyboard; F2 is what a tree
                        // view is expected to answer to, and the Library page can do it too.
                        onKeyDown={(event) => {
                          if (event.key === "F2") startRename(subject);
                        }}
                        title={
                          subject === UNASSIGNED_SUBJECT ? undefined : t("nav.renameFolderHint")
                        }
                        type="button"
                      >
                        <span aria-hidden="true" className="sidebar-library-folder-caret" />
                        <span aria-hidden="true" className="sidebar-library-folder-icon" />
                        <span className="sidebar-library-folder-label">{name}</span>
                      </button>
                    </h3>
                  )}
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
                            draggable
                            href="#library"
                            key={item.id}
                            onClick={(event) => {
                              event.preventDefault();
                              window.dispatchEvent(
                                new CustomEvent(STUDY_MATERIAL_OPEN_EVENT, { detail: item.id }),
                              );
                            }}
                            onDragStart={(event) => {
                              // An anchor drags its href by default, which would make the
                              // drop look like a link drop rather than a file move.
                              event.dataTransfer.clearData();
                              event.dataTransfer.setData("text/plain", item.id);
                              event.dataTransfer.effectAllowed = "move";
                            }}
                            onDragEnd={() => setDragOverSubject(null)}
                            title={t("nav.openLibrary", { name: item.name })}
                          >
                            <strong>{item.name}</strong>
                          </a>
                        ))}
                      </div>
                      {items.length > FILES_PER_FOLDER ? (
                        <button
                          // The visible label repeats in every folder, so the course names the target.
                          aria-label={t(uncapped ? "nav.showLessAria" : "nav.showMoreAria", {
                            name,
                          })}
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
        {/* The chatbot answers "how do I" faster than the form does, so it leads and the
            feedback form stays for the things it cannot fix. */}
        <a className="sidebar-utility-link sidebar-utility-primary" href="#help">
          <span aria-hidden="true">?</span> {t("nav.help")}
        </a>
        <p className="sidebar-utility-hint">{t("nav.helpHint")}</p>
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
