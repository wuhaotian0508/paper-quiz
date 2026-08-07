import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
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
      "https://docs.google.com/forms/d/e/1FAIpQLSdgqSIBtVjXqOVEsb586N1_vdIAcYz-ce-54pfxERikOGudRQ/viewform",
    );
    expect(screen.getByRole("link", { name: "Dashboard" })).toHaveAttribute("aria-current", "page");

    fireEvent.click(calendar);

    expect(calendar).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Dashboard" })).not.toHaveAttribute("aria-current");
  });

  it("provides a single Library destination for saved materials", () => {
    render(<DashboardNavigation />);

    const library = screen.getByRole("link", { name: "Library" });
    expect(library).toHaveAttribute("href", "#library");

    fireEvent.click(library);
    expect(library).toHaveAttribute("aria-current", "page");
  });

  it("no longer offers Quiz Lab, which pointed at the dashboard, or a second materials list", () => {
    render(<DashboardNavigation />);

    expect(screen.queryByRole("link", { name: "Quiz Lab" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Review Sheets" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "History" })).not.toBeInTheDocument();
  });

  it("lets a learner switch to dark mode and remembers the choice", () => {
    render(<DashboardNavigation />);

    const themeToggle = screen.getByRole("button", { name: "Switch to dark theme" });
    fireEvent.click(themeToggle);

    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
    expect(window.localStorage.getItem("paper-quiz-theme")).toBe("dark");
    expect(screen.getByRole("button", { name: "Switch to light theme" })).toBeInTheDocument();
  });

  it("shows uploaded PDFs in the Your Library sidebar", () => {
    window.localStorage.setItem(
      "paper-plane-quiz-library-v1",
      JSON.stringify([
        {
          id: "biology.pdf::1200",
          name: "Biology.pdf",
          uploadedAt: "2026-08-05T10:00:00.000Z",
          lastOpenedAt: "",
        },
      ]),
    );

    render(<DashboardNavigation />);

    expect(screen.getByRole("heading", { name: "Your Library" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Biology.pdf" })).toHaveAttribute("href", "#library");
    expect(screen.getByRole("link", { name: "+ New" })).toHaveAttribute("href", "#dashboard");
  });

  it("opens a specific library PDF instead of the all-history view", () => {
    window.localStorage.setItem(
      "paper-plane-quiz-library-v1",
      JSON.stringify([
        {
          id: "biology.pdf::1200",
          name: "Biology.pdf",
          uploadedAt: "2026-08-05T10:00:00.000Z",
          lastOpenedAt: "",
        },
      ]),
    );
    const onOpen = vi.fn();
    window.addEventListener("paper-quiz-open-material", onOpen);

    render(<DashboardNavigation />);
    fireEvent.click(screen.getByRole("link", { name: "Biology.pdf" }));

    expect(onOpen).toHaveBeenCalledTimes(1);
    expect((onOpen.mock.calls[0][0] as CustomEvent<string>).detail).toBe("biology.pdf::1200");
    window.removeEventListener("paper-quiz-open-material", onOpen);
  });

  it("starts in English and switches the sidebar to Chinese", () => {
    render(<DashboardNavigation />);

    expect(screen.getByRole("link", { name: "Dashboard" })).toBeInTheDocument();
    expect(screen.getByText("Your Library")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "切换为中文" }));

    expect(screen.getByRole("link", { name: "主页" })).toHaveAttribute("href", "#dashboard");
    expect(screen.getByText("我的资料库")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Dashboard" })).not.toBeInTheDocument();
    expect(window.localStorage.getItem("paper-quiz-locale")).toBe("zh");
    expect(document.documentElement.lang).toBe("zh-CN");
  });

  it("restores the stored locale on mount and can switch back to English", () => {
    window.localStorage.setItem("paper-quiz-locale", "zh");

    render(<DashboardNavigation />);
    expect(screen.getByRole("link", { name: "错题本" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Switch to English" }));

    expect(screen.getByRole("link", { name: "Mistake Book" })).toBeInTheDocument();
    expect(window.localStorage.getItem("paper-quiz-locale")).toBe("en");
  });
});
