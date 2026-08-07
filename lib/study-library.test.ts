import { describe, expect, it } from "vitest";
import { readStudyLibrary, upsertStudyLibrary, type StudyLibraryRecord } from "./study-library";

describe("study library", () => {
  it("keeps an uploaded PDF in the library before it has a quiz session", () => {
    const uploaded: StudyLibraryRecord = {
      id: "Business Model Canvas.pdf::1200",
      name: "Business Model Canvas.pdf",
      uploadedAt: "2026-08-05T10:00:00.000Z",
      lastOpenedAt: "",
    };

    const next = upsertStudyLibrary([], uploaded);

    expect(readStudyLibrary(JSON.stringify(next))).toEqual([uploaded]);
  });

  it("updates an existing PDF without creating a duplicate", () => {
    const first: StudyLibraryRecord = {
      id: "lecture.pdf::100",
      name: "lecture.pdf",
      uploadedAt: "2026-08-04T10:00:00.000Z",
      lastOpenedAt: "",
    };
    const opened = { ...first, lastOpenedAt: "2026-08-05T10:00:00.000Z" };

    expect(upsertStudyLibrary([first], opened)).toEqual([opened]);
  });
});
