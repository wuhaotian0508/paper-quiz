import { describe, expect, it } from "vitest";
import {
  createLibraryRecord,
  listSubjects,
  readStudyLibrary,
  addStudySubject,
  libraryFolders,
  readStudySubjects,
  removeLibrarySubject,
  removeStudySubject,
  renameStudySubject,
  renameLibrarySubject,
  setLibrarySubject,
  upsertStudyLibrary,
  type StudyLibraryRecord,
} from "./study-library";
import { normalizeMaterialId } from "./study-history";

const now = new Date("2026-08-06T10:00:00.000Z");

const record = (overrides: Partial<StudyLibraryRecord> = {}): StudyLibraryRecord => ({
  id: "lecture.pdf",
  name: "lecture.pdf",
  uploadedAt: "2026-08-04T10:00:00.000Z",
  lastOpenedAt: "",
  subject: "",
  updatedAt: "2026-08-04T10:00:00.000Z",
  ...overrides,
});

describe("study library", () => {
  it("keeps an uploaded PDF in the library before it has a quiz session", () => {
    const uploaded = record({
      id: "Business Model Canvas.pdf",
      name: "Business Model Canvas.pdf",
    });

    const next = upsertStudyLibrary([], uploaded);

    expect(readStudyLibrary(JSON.stringify(next))).toEqual([uploaded]);
  });

  it("updates an existing PDF without creating a duplicate", () => {
    const first = record();
    const opened = { ...first, lastOpenedAt: "2026-08-05T10:00:00.000Z" };

    expect(upsertStudyLibrary([first], opened)).toEqual([opened]);
  });

  it("guesses the course from the file name when a material is first seen", () => {
    const created = createLibraryRecord({ id: "x", name: "UGBA 117 Lecture 4.pdf" }, now);

    expect(created.subject).toBe("UGBA 117");
    expect(created.updatedAt).toBe(now.toISOString());
  });

  it("does not let marking a material as opened wipe its assigned subject", () => {
    const assigned = record({ subject: "MATH 1A" });
    // The "opened" write is built from material metadata and carries no subject.
    const opened = { ...assigned, subject: "", lastOpenedAt: "2026-08-06T10:00:00.000Z" };

    expect(upsertStudyLibrary([assigned], opened)[0].subject).toBe("MATH 1A");
  });

  it("lets a student unassign a subject, and does not re-guess it on the next load", () => {
    const guessed = createLibraryRecord({ id: "x", name: "UGBA 117 Lecture 4.pdf" }, now);

    const cleared = setLibrarySubject([guessed], "x", "", now);
    const reloaded = readStudyLibrary(JSON.stringify(cleared));

    expect(reloaded[0].subject).toBe("");
  });

  it("backfills subjects for a library saved before subjects existed", () => {
    const legacy = JSON.stringify([
      {
        id: "UGBA 117 Lecture 4.pdf",
        name: "UGBA 117 Lecture 4.pdf",
        uploadedAt: "2026-07-01T10:00:00.000Z",
        lastOpenedAt: "2026-07-02T10:00:00.000Z",
      },
    ]);

    const [migrated] = readStudyLibrary(legacy);

    expect(migrated.subject).toBe("UGBA 117");
    expect(migrated.updatedAt).toBe("2026-07-02T10:00:00.000Z");
  });

  it("lists the courses in use for the subject picker", () => {
    const records = [
      record({ id: "a", subject: "MATH 1A" }),
      record({ id: "b", subject: "" }),
      record({ id: "c", subject: "CS 61A" }),
      record({ id: "d", subject: "MATH 1A" }),
    ];

    expect(listSubjects(records)).toEqual(["CS 61A", "MATH 1A"]);
  });
});

describe("course folders", () => {
  const record = (id: string, subject: string): StudyLibraryRecord => ({
    id,
    name: `${id}.pdf`,
    uploadedAt: "2026-08-01T00:00:00.000Z",
    lastOpenedAt: "",
    subject,
    updatedAt: "2026-08-01T00:00:00.000Z",
  });
  const now = new Date("2026-08-07T12:00:00.000Z");

  it("renames a course everywhere it appears", () => {
    const next = renameLibrarySubject(
      [record("a", "UGBA 117"), record("b", "UGBA 117"), record("c", "CS 61A")],
      "UGBA 117",
      "UGBA 118",
      now,
    );
    expect(next.map((item) => item.subject)).toEqual(["UGBA 118", "UGBA 118", "CS 61A"]);
    expect(next[0].updatedAt).toBe(now.toISOString());
    // An untouched course keeps its timestamp, so a rename cannot win an unrelated merge.
    expect(next[2].updatedAt).toBe("2026-08-01T00:00:00.000Z");
  });

  it("merges into a course that already exists", () => {
    const next = renameLibrarySubject(
      [record("a", "UGBA 117"), record("b", "CS 61A")],
      "UGBA 117",
      "CS 61A",
      now,
    );
    expect(next.every((item) => item.subject === "CS 61A")).toBe(true);
  });

  it("normalises the new name the same way an upload would", () => {
    const next = renameLibrarySubject([record("a", "UGBA 117")], "UGBA 117", "  ugba   118 ", now);
    expect(next[0].subject).toBe("ugba 118");
  });

  it("leaves the library untouched when the name did not change", () => {
    const records = [record("a", "UGBA 117")];
    expect(renameLibrarySubject(records, "UGBA 117", "UGBA 117", now)).toBe(records);
  });

  it("deleting a course keeps its files and unassigns them", () => {
    const next = removeLibrarySubject(
      [record("a", "UGBA 117"), record("b", "CS 61A")],
      "UGBA 117",
      now,
    );
    // The PDFs are the student's uploads; only the label they applied is removed.
    expect(next).toHaveLength(2);
    expect(next[0].subject).toBe("");
    expect(next[1].subject).toBe("CS 61A");
  });
});

describe("hand-created courses", () => {
  it("keeps only valid, unique names", () => {
    // Case is preserved, matching how the rest of the app groups by subject.
    expect(
      readStudySubjects(JSON.stringify(["UGBA 117", "  UGBA   117 ", "", 7, "CS 61A"])),
    ).toEqual(["UGBA 117", "CS 61A"]);
  });

  it("survives storage that is not a list", () => {
    expect(readStudySubjects("null")).toEqual([]);
    expect(readStudySubjects("not json")).toEqual([]);
    expect(readStudySubjects(null)).toEqual([]);
  });

  it("adds a course and ignores one that already exists", () => {
    const subjects = addStudySubject([], "UGBA 117");
    expect(subjects).toEqual(["UGBA 117"]);
    // Returning the same array lets the caller skip a pointless write.
    expect(addStudySubject(subjects, " UGBA  117 ")).toBe(subjects);
    expect(addStudySubject(subjects, "   ")).toBe(subjects);
  });

  it("renames a course, merging when the new name is taken", () => {
    expect(renameStudySubject(["UGBA 117", "CS 61A"], "UGBA 117", "UGBA 118")).toEqual([
      "UGBA 118",
      "CS 61A",
    ]);
    expect(renameStudySubject(["UGBA 117", "CS 61A"], "UGBA 117", "CS 61A")).toEqual(["CS 61A"]);
  });

  it("removes a course", () => {
    expect(removeStudySubject(["UGBA 117", "CS 61A"], " UGBA  117 ")).toEqual(["CS 61A"]);
  });

  it("shows an empty course alongside the ones that have files", () => {
    const grouped = [
      { subject: "UGBA 117", items: ["a"] },
      { subject: "", items: ["b"] },
    ];

    // Sorted among the rest, not appended after them, and unassigned still sorts last.
    expect(libraryFolders(grouped, ["MATH 1A", "UGBA 117"])).toEqual([
      { subject: "MATH 1A", items: [] },
      { subject: "UGBA 117", items: ["a"] },
      { subject: "", items: ["b"] },
    ]);
  });
});

describe("one PDF name, one material", () => {
  it("collapses the copies one PDF got, one per byte size it was saved at", () => {
    const stored = JSON.stringify([
      {
        id: "Topic 1.pdf::900",
        name: "Topic 1.pdf",
        uploadedAt: "2026-07-01T10:00:00.000Z",
        lastOpenedAt: "2026-08-05T10:00:00.000Z",
        subject: "",
        updatedAt: "2026-08-05T10:00:00.000Z",
      },
      {
        id: "Topic 1.pdf::1200",
        name: "Topic 1.pdf",
        uploadedAt: "2026-06-01T10:00:00.000Z",
        lastOpenedAt: "2026-08-01T10:00:00.000Z",
        subject: "UGBA 117",
        updatedAt: "2026-08-01T10:00:00.000Z",
      },
    ]);

    const merged = readStudyLibrary(stored);

    expect(merged).toHaveLength(1);
    expect(merged[0].id).toBe("Topic 1.pdf");
    // The copy filed under a course is rarely the one opened last, so the subject survives.
    expect(merged[0].subject).toBe("UGBA 117");
    expect(merged[0].lastOpenedAt).toBe("2026-08-05T10:00:00.000Z");
    expect(merged[0].uploadedAt).toBe("2026-06-01T10:00:00.000Z");
  });

  it("keeps two genuinely different PDFs apart", () => {
    const stored = JSON.stringify(
      ["Topic 1.pdf::900", "Topic 6.pdf::900"].map((id) => ({
        id,
        name: id.split("::")[0],
        uploadedAt: "2026-07-01T10:00:00.000Z",
        lastOpenedAt: "",
        subject: "",
        updatedAt: "2026-07-01T10:00:00.000Z",
      })),
    );

    expect(readStudyLibrary(stored).map((item) => item.id)).toEqual(["Topic 1.pdf", "Topic 6.pdf"]);
  });

  it("leaves a name that merely contains digits alone", () => {
    expect(normalizeMaterialId("Lecture 2026.pdf")).toBe("Lecture 2026.pdf");
    expect(normalizeMaterialId("Topic 1.pdf::900")).toBe("Topic 1.pdf");
    expect(normalizeMaterialId("Topic 1.pdf")).toBe("Topic 1.pdf");
    expect(normalizeMaterialId("")).toBe("");
  });
});
