import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { LibraryView } from "./library-view";
import type { StudyLibraryRecord } from "@/lib/study-library";
import type { StudyMaterial } from "@/lib/study-material";

afterEach(cleanup);

const material = (id: string, name: string, lastPracticedAt = ""): StudyMaterial => ({
  id,
  name,
  sessions: [],
  questions: [],
  mistakes: [],
  lastPracticedAt,
});

const record = (id: string, name: string, subject: string): StudyLibraryRecord => ({
  id,
  name,
  uploadedAt: "2026-08-01T10:00:00.000Z",
  lastOpenedAt: "",
  subject,
  updatedAt: "2026-08-01T10:00:00.000Z",
});

const renderLibrary = (overrides: Partial<Parameters<typeof LibraryView>[0]> = {}) =>
  render(
    <LibraryView
      materials={[
        material("ugba-1", "UGBA 117 Lecture 1.pdf", "2026-08-05T10:00:00.000Z"),
        material("math-1", "MATH 1A Notes.pdf", "2026-08-04T10:00:00.000Z"),
        material("loose", "scan.pdf"),
      ]}
      library={[
        record("ugba-1", "UGBA 117 Lecture 1.pdf", "UGBA 117"),
        record("math-1", "MATH 1A Notes.pdf", "MATH 1A"),
        record("loose", "scan.pdf", ""),
      ]}
      onAssignSubject={vi.fn()}
      onBack={vi.fn()}
      onOpen={vi.fn()}
      {...overrides}
    />,
  );

it("groups materials under their course, with unassigned files last", () => {
  renderLibrary();

  const headings = screen.getAllByRole("heading", { level: 2 }).map((node) => node.textContent);

  expect(headings).toEqual([
    expect.stringContaining("MATH 1A"),
    expect.stringContaining("UGBA 117"),
    expect.stringContaining("Unassigned"),
  ]);
});

it("assigns a course to a material from its picker", () => {
  const onAssignSubject = vi.fn();
  renderLibrary({ onAssignSubject });

  fireEvent.change(screen.getByLabelText("Course for scan.pdf"), {
    target: { value: "MATH 1A" },
  });

  expect(onAssignSubject).toHaveBeenCalledWith("loose", "MATH 1A");
});

it("offers every course in use plus an unassigned option in the picker", () => {
  renderLibrary();

  const options = within(screen.getByLabelText("Course for scan.pdf"))
    .getAllByRole("option")
    .map((node) => node.textContent);

  expect(options).toEqual(["Unassigned", "MATH 1A", "UGBA 117", "New course…"]);
});

it("switches between grid and list layouts", () => {
  const { container } = renderLibrary();

  expect(container.querySelector(".library-grid")).not.toBeNull();

  fireEvent.click(screen.getByRole("button", { name: "List view" }));

  expect(container.querySelector(".library-grid")).toBeNull();
  expect(container.querySelector(".library-list")).not.toBeNull();
});

it("reorders materials by name when the sort is changed", () => {
  renderLibrary({
    materials: [
      material("b", "Zebra.pdf", "2026-08-05T10:00:00.000Z"),
      material("a", "Apple.pdf", "2026-08-04T10:00:00.000Z"),
    ],
    library: [record("b", "Zebra.pdf", "BIO 1"), record("a", "Apple.pdf", "BIO 1")],
  });

  const names = () =>
    screen.getAllByRole("button", { name: /^Open / }).map((node) => node.getAttribute("aria-label"));

  expect(names()).toEqual(["Open Zebra.pdf", "Open Apple.pdf"]);

  fireEvent.change(screen.getByLabelText("Sort materials"), { target: { value: "name" } });

  expect(names()).toEqual(["Open Apple.pdf", "Open Zebra.pdf"]);
});

it("tells the student when nothing has been uploaded yet", () => {
  renderLibrary({ materials: [], library: [] });

  expect(screen.getByText("Your materials will appear here.")).toBeInTheDocument();
});
