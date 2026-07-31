import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { DashboardNavigation } from "./dashboard-navigation";

afterEach(() => {
  cleanup();
  window.history.replaceState(null, "", "/");
  window.localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
});

describe("DashboardNavigation", () => {
  it("updates the selected sidebar item when a learner opens Calendar", () => {
    render(<DashboardNavigation />);

    const calendar = screen.getByRole("link", { name: "Calendar" });
    expect(calendar).toHaveAttribute("href", "#progress");
    expect(screen.getByRole("link", { name: "Help" })).toHaveAttribute("href", "#help");
    expect(screen.getByRole("link", { name: "Feedback" })).toHaveAttribute(
      "href",
      expect.stringContaining("mailto:haotianwu123@berkeley.edu"),
    );
    expect(screen.getByRole("link", { name: "Dashboard" })).toHaveAttribute("aria-current", "page");

    fireEvent.click(calendar);

    expect(calendar).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Dashboard" })).not.toHaveAttribute("aria-current");
  });

  it("lets a learner switch to dark mode and remembers the choice", () => {
    render(<DashboardNavigation />);

    const themeToggle = screen.getByRole("button", { name: "Switch to dark theme" });
    fireEvent.click(themeToggle);

    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
    expect(window.localStorage.getItem("paper-quiz-theme")).toBe("dark");
    expect(screen.getByRole("button", { name: "Switch to light theme" })).toBeInTheDocument();
  });
});
