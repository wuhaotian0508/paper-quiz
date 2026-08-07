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
      { id: "biology.pdf", name: "Biology.pdf", uploadedAt: "2026-08-05T10:00:00.000Z" },
    ]);

    render(<DashboardNavigation />);

    expect(screen.getByRole("heading", { name: "Your Library" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Biology.pdf" })).toHaveAttribute("href", "#library");
    // "+ New" adds a course rather than linking to the upload page, which the Dashboard
    // item directly above it already reaches.
    expect(screen.getByRole("button", { name: "Add a course" })).toHaveTextContent("+ New");
  });

  it("opens a specific library PDF instead of the all-history view", () => {
    storeLibrary([
      { id: "biology.pdf", name: "Biology.pdf", uploadedAt: "2026-08-05T10:00:00.000Z" },
    ]);
    const onOpen = vi.fn();
    window.addEventListener("paper-quiz-open-material", onOpen);

    render(<DashboardNavigation />);
    fireEvent.click(screen.getByRole("link", { name: "Biology.pdf" }));

    expect(onOpen).toHaveBeenCalledTimes(1);
    expect((onOpen.mock.calls[0][0] as CustomEvent<string>).detail).toBe("biology.pdf");
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
    expect(screen.getByRole("button", { name: "MATH 1A" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
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

describe("organising courses from the sidebar", () => {
  /** Stored with subjects already assigned, the way an established library looks. */
  const storeCourses = (records: { id: string; name: string; subject: string }[]) =>
    window.localStorage.setItem(
      "paper-plane-quiz-library-v1",
      JSON.stringify(
        records.map((record) => ({
          ...record,
          uploadedAt: "2026-08-01T00:00:00.000Z",
          lastOpenedAt: "",
          updatedAt: "2026-08-01T00:00:00.000Z",
        })),
      ),
    );

  const storedLibrary = () =>
    JSON.parse(window.localStorage.getItem("paper-plane-quiz-library-v1") || "[]") as {
      id: string;
      subject: string;
    }[];

  /** A DataTransfer stand-in; jsdom does not construct one. */
  const dataTransfer = (id = "") => {
    const store = new Map<string, string>([["text/plain", id]]);
    return {
      dropEffect: "",
      effectAllowed: "",
      clearData: () => store.clear(),
      getData: (format: string) => store.get(format) ?? "",
      setData: (format: string, value: string) => void store.set(format, value),
    };
  };

  function folderOf(name: string) {
    const label = screen.getByText(name);
    const folder = label.closest(".sidebar-library-folder");
    if (!folder) throw new Error(`no folder for ${name}`);
    return folder;
  }

  it("moves a PDF into another course when it is dropped there", () => {
    storeCourses([
      { id: "m1", name: "Week 1.pdf", subject: "UGBA 117" },
      { id: "m2", name: "Reader.pdf", subject: "CS 61A" },
    ]);
    render(<DashboardNavigation />);

    const dragged = screen.getByText("Week 1.pdf");
    const transfer = dataTransfer();
    fireEvent.dragStart(dragged, { dataTransfer: transfer });
    const target = folderOf("CS 61A");
    fireEvent.dragOver(target, { dataTransfer: transfer });
    fireEvent.drop(target, { dataTransfer: transfer });

    expect(storedLibrary().find((item) => item.id === "m1")?.subject).toBe("CS 61A");
    expect(folderOf("CS 61A")).toHaveTextContent("Week 1.pdf");
  });

  it("unassigns a PDF dropped on the unassigned folder", () => {
    storeCourses([
      { id: "m1", name: "Week 1.pdf", subject: "UGBA 117" },
      { id: "m2", name: "Loose.pdf", subject: "" },
    ]);
    render(<DashboardNavigation />);

    const transfer = dataTransfer("m1");
    const target = folderOf("Unassigned");
    fireEvent.dragOver(target, { dataTransfer: transfer });
    fireEvent.drop(target, { dataTransfer: transfer });

    expect(storedLibrary().find((item) => item.id === "m1")?.subject).toBe("");
  });

  it("renames a course on double-click and keeps its files", () => {
    storeCourses([{ id: "m1", name: "Week 1.pdf", subject: "UGBA 117" }]);
    render(<DashboardNavigation />);

    fireEvent.doubleClick(screen.getByText("UGBA 117"));
    const input = screen.getByLabelText("Course name");
    fireEvent.change(input, { target: { value: "UGBA 118" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(storedLibrary()).toEqual([expect.objectContaining({ id: "m1", subject: "UGBA 118" })]);
    expect(folderOf("UGBA 118")).toHaveTextContent("Week 1.pdf");
  });

  it("abandons a rename on Escape", () => {
    storeCourses([{ id: "m1", name: "Week 1.pdf", subject: "UGBA 117" }]);
    render(<DashboardNavigation />);

    fireEvent.doubleClick(screen.getByText("UGBA 117"));
    const input = screen.getByLabelText("Course name");
    fireEvent.change(input, { target: { value: "Nonsense" } });
    fireEvent.keyDown(input, { key: "Escape" });

    expect(storedLibrary()[0].subject).toBe("UGBA 117");
    expect(screen.getByText("UGBA 117")).toBeInTheDocument();
  });

  it("treats an emptied name as a cancel, not as an unassign", () => {
    storeCourses([{ id: "m1", name: "Week 1.pdf", subject: "UGBA 117" }]);
    render(<DashboardNavigation />);

    fireEvent.doubleClick(screen.getByText("UGBA 117"));
    const input = screen.getByLabelText("Course name");
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(storedLibrary()[0].subject).toBe("UGBA 117");
  });

  it("deletes a course but keeps the PDFs, leaving them unassigned", () => {
    storeCourses([
      { id: "m1", name: "Week 1.pdf", subject: "UGBA 117" },
      { id: "m2", name: "Reader.pdf", subject: "CS 61A" },
    ]);
    render(<DashboardNavigation />);

    fireEvent.doubleClick(screen.getByText("UGBA 117"));
    fireEvent.mouseDown(
      screen.getByLabelText("Delete the UGBA 117 course and leave its files unassigned"),
    );

    expect(storedLibrary()).toHaveLength(2);
    expect(storedLibrary().find((item) => item.id === "m1")?.subject).toBe("");
    expect(screen.getByText("Week 1.pdf")).toBeInTheDocument();
    expect(screen.queryByText("UGBA 117")).not.toBeInTheDocument();
  });

  it("offers no rename for the unassigned folder, which is not a course", () => {
    storeCourses([{ id: "m1", name: "Loose.pdf", subject: "" }]);
    render(<DashboardNavigation />);

    fireEvent.doubleClick(screen.getByText("Unassigned"));

    expect(screen.queryByLabelText("Course name")).not.toBeInTheDocument();
  });

  it("starts a rename from the keyboard with F2", () => {
    storeCourses([{ id: "m1", name: "Week 1.pdf", subject: "UGBA 117" }]);
    render(<DashboardNavigation />);

    // Double-click has no keyboard equivalent; a tree view is expected to answer to F2.
    fireEvent.keyDown(screen.getByText("UGBA 117"), { key: "F2" });

    expect(screen.getByLabelText("Course name")).toHaveValue("UGBA 117");
  });
});

describe("creating a course from the sidebar", () => {
  const storedSubjects = () =>
    JSON.parse(window.localStorage.getItem("paper-plane-quiz-subjects-v1") || "[]") as string[];

  const storedLibrary = () =>
    JSON.parse(window.localStorage.getItem("paper-plane-quiz-library-v1") || "[]") as {
      id: string;
      subject: string;
    }[];

  const storeCourses = (records: { id: string; name: string; subject: string }[]) =>
    window.localStorage.setItem(
      "paper-plane-quiz-library-v1",
      JSON.stringify(
        records.map((record) => ({
          ...record,
          uploadedAt: "2026-08-01T00:00:00.000Z",
          lastOpenedAt: "",
          updatedAt: "2026-08-01T00:00:00.000Z",
        })),
      ),
    );

  it("adds an empty course that survives a reload", () => {
    render(<DashboardNavigation />);

    fireEvent.click(screen.getByRole("button", { name: "Add a course" }));
    const input = screen.getByLabelText("New course name");
    fireEvent.change(input, { target: { value: "MATH 1A" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(storedSubjects()).toEqual(["MATH 1A"]);
    // A course is otherwise only a field on a material, so an empty one needs its own store.
    cleanup();
    render(<DashboardNavigation />);
    expect(screen.getByText("MATH 1A")).toBeInTheDocument();
  });

  it("abandons the new course on Escape", () => {
    render(<DashboardNavigation />);

    fireEvent.click(screen.getByRole("button", { name: "Add a course" }));
    const input = screen.getByLabelText("New course name");
    fireEvent.change(input, { target: { value: "MATH 1A" } });
    fireEvent.keyDown(input, { key: "Escape" });

    expect(storedSubjects()).toEqual([]);
    expect(screen.queryByText("MATH 1A")).not.toBeInTheDocument();
  });

  it("ignores an empty name", () => {
    render(<DashboardNavigation />);

    fireEvent.click(screen.getByRole("button", { name: "Add a course" }));
    fireEvent.keyDown(screen.getByLabelText("New course name"), { key: "Enter" });

    expect(storedSubjects()).toEqual([]);
  });

  it("accepts a PDF dragged into a course that is still empty", () => {
    window.localStorage.setItem("paper-plane-quiz-subjects-v1", JSON.stringify(["MATH 1A"]));
    storeCourses([{ id: "m1", name: "Week 1.pdf", subject: "UGBA 117" }]);
    render(<DashboardNavigation />);

    const store = new Map([["text/plain", "m1"]]);
    const transfer = {
      dropEffect: "",
      getData: (format: string) => store.get(format) ?? "",
      setData: () => undefined,
      clearData: () => undefined,
    };
    const target = screen.getByText("MATH 1A").closest(".sidebar-library-folder");
    if (!target) throw new Error("no folder");
    fireEvent.dragOver(target, { dataTransfer: transfer });
    fireEvent.drop(target, { dataTransfer: transfer });

    expect(storedLibrary().find((item) => item.id === "m1")?.subject).toBe("MATH 1A");
  });

  it("renaming an empty course does not resurrect the old name", () => {
    window.localStorage.setItem("paper-plane-quiz-subjects-v1", JSON.stringify(["MATH 1A"]));
    render(<DashboardNavigation />);

    fireEvent.doubleClick(screen.getByText("MATH 1A"));
    const input = screen.getByLabelText("Course name");
    fireEvent.change(input, { target: { value: "MATH 1B" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(storedSubjects()).toEqual(["MATH 1B"]);
    expect(screen.queryByText("MATH 1A")).not.toBeInTheDocument();
  });

  it("deleting an empty course removes the folder", () => {
    window.localStorage.setItem("paper-plane-quiz-subjects-v1", JSON.stringify(["MATH 1A"]));
    render(<DashboardNavigation />);

    fireEvent.doubleClick(screen.getByText("MATH 1A"));
    fireEvent.mouseDown(
      screen.getByLabelText("Delete the MATH 1A course and leave its files unassigned"),
    );

    expect(storedSubjects()).toEqual([]);
    expect(screen.queryByText("MATH 1A")).not.toBeInTheDocument();
  });
});
