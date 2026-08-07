import { describe, expect, it } from "vitest";
import {
  createLibraryRecord,
  listSubjects,
  readStudyLibrary,
  setLibrarySubject,
  upsertStudyLibrary,
  type StudyLibraryRecord,
} from "./study-library";

const now = new Date("2026-08-06T10:00:00.000Z");

const record = (overrides: Partial<StudyLibraryRecord> = {}): StudyLibraryRecord => ({
  id: "lecture.pdf::100",
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
      id: "Business Model Canvas.pdf::1200",
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
    const created = createLibraryRecord({ id: "x::1", name: "UGBA 117 Lecture 4.pdf" }, now);

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
    const guessed = createLibraryRecord({ id: "x::1", name: "UGBA 117 Lecture 4.pdf" }, now);

    const cleared = setLibrarySubject([guessed], "x::1", "", now);
    const reloaded = readStudyLibrary(JSON.stringify(cleared));

    expect(reloaded[0].subject).toBe("");
  });

  it("backfills subjects for a library saved before subjects existed", () => {
    const legacy = JSON.stringify([
      {
        id: "UGBA 117 Lecture 4.pdf::900",
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
      record({ id: "a::1", subject: "MATH 1A" }),
      record({ id: "b::1", subject: "" }),
      record({ id: "c::1", subject: "CS 61A" }),
      record({ id: "d::1", subject: "MATH 1A" }),
    ];

    expect(listSubjects(records)).toEqual(["CS 61A", "MATH 1A"]);
  });
});
