import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DashboardNavigation } from "./dashboard-navigation";

afterEach(() => {
  cleanup();
  window.history.replaceState(null, "", "/");
  window.localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
});

/** Stored the way an upload writes it: no subject, which is what the read backfills from. */
const storeLibrary = (records: { id: string; name: string; uploadedAt: string }[]) =>
  window.localStorage.setItem(
    "paper-plane-quiz-library-v1",
    JSON.stringify(records.map((record) => ({ ...record, lastOpenedAt: "" }))),
  );

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
    storeLibrary([
      { id: "biology.pdf::1200", name: "Biology.pdf", uploadedAt: "2026-08-05T10:00:00.000Z" },
    ]);

    render(<DashboardNavigation />);

    expect(screen.getByRole("heading", { name: "Your Library" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Biology.pdf" })).toHaveAttribute("href", "#library");
    expect(screen.getByRole("link", { name: "+ New" })).toHaveAttribute("href", "#dashboard");
  });

  it("opens a specific library PDF instead of the all-history view", () => {
    storeLibrary([
      { id: "biology.pdf::1200", name: "Biology.pdf", uploadedAt: "2026-08-05T10:00:00.000Z" },
    ]);
    const onOpen = vi.fn();
    window.addEventListener("paper-quiz-open-material", onOpen);

    render(<DashboardNavigation />);
    fireEvent.click(screen.getByRole("link", { name: "Biology.pdf" }));

    expect(onOpen).toHaveBeenCalledTimes(1);
    expect((onOpen.mock.calls[0][0] as CustomEvent<string>).detail).toBe("biology.pdf::1200");
    window.removeEventListener("paper-quiz-open-material", onOpen);
  });

  it("files sidebar PDFs into course folders, with unassigned ones last", () => {
    storeLibrary([
      { id: "1", name: "scan.pdf", uploadedAt: "2026-08-01T10:00:00.000Z" },
      { id: "2", name: "UGBA 117 Lecture 1.pdf", uploadedAt: "2026-08-02T10:00:00.000Z" },
      { id: "3", name: "MATH 1A Notes.pdf", uploadedAt: "2026-08-03T10:00:00.000Z" },
    ]);

    render(<DashboardNavigation />);

    expect(screen.getAllByRole("heading", { level: 3 }).map((node) => node.textContent)).toEqual([
      "MATH 1A",
      "UGBA 117",
      "Unassigned",
    ]);
  });

  it("holds a folder to a few files until the learner asks for the rest", () => {
    storeLibrary(
      [1, 2, 3, 4, 5].map((n) => ({
        id: `bio-${n}`,
        name: `BIO 1 Week ${n}.pdf`,
        // Ascending, so the newest upload is the one the collapsed folder leaves out last.
        uploadedAt: `2026-08-0${n}T10:00:00.000Z`,
      })),
    );

    render(<DashboardNavigation />);

    expect(screen.getAllByRole("link", { name: /^BIO 1 Week/ })).toHaveLength(4);
    expect(screen.queryByRole("link", { name: "BIO 1 Week 1.pdf" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Show every file in BIO 1" }));

    expect(screen.getAllByRole("link", { name: /^BIO 1 Week/ })).toHaveLength(5);
    expect(screen.getByRole("link", { name: "BIO 1 Week 1.pdf" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Show fewer files in BIO 1" }));

    expect(screen.getAllByRole("link", { name: /^BIO 1 Week/ })).toHaveLength(4);
  });

  it("folds a whole course away when its name is clicked, and remembers it was expanded", () => {
    storeLibrary(
      [1, 2, 3, 4, 5].map((n) => ({
        id: `bio-${n}`,
        name: `BIO 1 Week ${n}.pdf`,
        uploadedAt: `2026-08-0${n}T10:00:00.000Z`,
      })),
    );

    render(<DashboardNavigation />);
    fireEvent.click(screen.getByRole("button", { name: "Show every file in BIO 1" }));
    expect(screen.getAllByRole("link", { name: /^BIO 1 Week/ })).toHaveLength(5);

    const folder = screen.getByRole("button", { name: "BIO 1" });
    fireEvent.click(folder);

    expect(folder).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryAllByRole("link", { name: /^BIO 1 Week/ })).toHaveLength(0);
    expect(screen.queryByRole("button", { name: /^Show/ })).not.toBeInTheDocument();

    fireEvent.click(folder);

    expect(folder).toHaveAttribute("aria-expanded", "true");
    expect(screen.getAllByRole("link", { name: /^BIO 1 Week/ })).toHaveLength(5);
  });

  it("folds one course without touching the others", () => {
    storeLibrary([
      { id: "1", name: "BIO 1 Notes.pdf", uploadedAt: "2026-08-01T10:00:00.000Z" },
      { id: "2", name: "MATH 1A Notes.pdf", uploadedAt: "2026-08-02T10:00:00.000Z" },
    ]);

    render(<DashboardNavigation />);
    fireEvent.click(screen.getByRole("button", { name: "BIO 1" }));

    expect(screen.queryByRole("link", { name: "BIO 1 Notes.pdf" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "MATH 1A Notes.pdf" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "MATH 1A" })).toHaveAttribute("aria-expanded", "true");
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
