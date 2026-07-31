"use client";

import { useEffect, useState } from "react";
import { AuthMenu } from "@/components/auth-menu";
import { createFeedbackHref } from "@/lib/feedback";

const navigationItems = [
  { id: "dashboard", label: "Dashboard", icon: "D" },
  { id: "quiz-lab", label: "Quiz Lab", icon: "Q" },
  { id: "mistake-book", label: "Mistake Book", icon: "!" },
  { id: "progress", label: "Calendar", icon: "C" },
  { id: "history", label: "History", icon: "H" },
] as const;

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

  useEffect(() => {
    const syncWithLocation = () => setActiveId(selectedNavigationId(window.location.hash));

    syncWithLocation();
    window.addEventListener("hashchange", syncWithLocation);
    return () => window.removeEventListener("hashchange", syncWithLocation);
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
        <span>*</span> Paper Plane Quiz
      </a>
      <nav className="sidebar-nav" aria-label="Main navigation">
        {navigationItems.map((item) => (
          <a
            aria-current={activeId === item.id ? "page" : undefined}
            href={`#${item.id}`}
            key={item.id}
            onClick={() => setActiveId(item.id)}
          >
            <span aria-hidden="true">{item.icon}</span> {item.label}
          </a>
        ))}
      </nav>
      <div className="sidebar-utilities">
        <a className="sidebar-utility-link" href="#help">
          <span aria-hidden="true">?</span> Help
        </a>
        <a className="sidebar-utility-link" href={createFeedbackHref()}>
          <span aria-hidden="true">@</span> Feedback
        </a>
        <button
          aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
          className="sidebar-theme-toggle"
          onClick={toggleTheme}
          type="button"
        >
          <span aria-hidden="true">{theme === "dark" ? "L" : "D"}</span>
          {theme === "dark" ? "Light mode" : "Dark mode"}
        </button>
        <div className="sidebar-account">
          <AuthMenu authError={authError} />
        </div>
      </div>
    </aside>
  );
}
