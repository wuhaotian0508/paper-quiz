import { describe, expect, it } from "vitest";
import { groupStudyMaterials, mergeStudyLibraryMaterials, UNGROUPED_NAME } from "./study-material";
import { EMPTY_SOURCE, type PersistedSource, type StudySession } from "./study-history";
import type { MistakeBookEntry } from "./mistake-book";
import { questionKey, type Question } from "./quiz";
import type { StudyLibraryRecord } from "./study-library";

const source = (materialName: string): PersistedSource => ({
  fileId: "file-abc123",
  transcript: "",
  materialId: `${materialName}::1000`,
  materialName,
});

const question = (prompt: string): Question => ({
  // Every quiz numbers from q1, which is exactly why grouping cannot key on this.
  id: "q1",
  type: "fill_blank",
  prompt,
  acceptedAnswers: ["yes"],
  referenceAnswer: "Yes",
  explanation: "Because.",
  sourceNote: "Page 1",
});

const session = (
  id: string,
  createdAt: string,
  materialName: string,
  prompts: string[],
): StudySession => ({
  id,
  title: `${materialName} quiz`,
  createdAt,
  questions: prompts.map(question),
  answers: {},
  grades: {},
  chat: {},
  source: source(materialName),
});

const mistake = (prompt: string, materialName: string, updatedAt: string): MistakeBookEntry => ({
  version: 1,
  id: questionKey(question(prompt)),
  question: question(prompt),
  answer: "no",
  status: "incorrect",
  score: 0,
  feedback: "Review it.",
  missingPoints: [],
  updatedAt,
  source: source(materialName),
});

describe("groupStudyMaterials", () => {
  it("collects every question and mistake under its own PDF", () => {
    const materials = groupStudyMaterials(
      [
        session("s1", "2026-07-27T10:00:00", "lecture-1.pdf", ["A ___", "B ___"]),
        session("s2", "2026-07-26T10:00:00", "lecture-2.pdf", ["C ___"]),
      ],
      [
        mistake("A ___", "lecture-1.pdf", "2026-07-27T10:05:00"),
        mistake("C ___", "lecture-2.pdf", "2026-07-26T10:05:00"),
      ],
    );

    expect(materials.map((item) => item.name)).toEqual(["lecture-1.pdf", "lecture-2.pdf"]);
    expect(materials[0].questions.map((item) => item.prompt)).toEqual(["A ___", "B ___"]);
    expect(materials[0].mistakes).toHaveLength(1);
    expect(materials[1].questions.map((item) => item.prompt)).toEqual(["C ___"]);
    expect(materials[1].mistakes).toHaveLength(1);
  });

  it("merges repeat quizzes on one PDF and dedupes questions by content", () => {
    const materials = groupStudyMaterials(
      [
        session("s2", "2026-07-27T10:00:00", "lecture-1.pdf", ["Fresh ___", "Shared ___"]),
        session("s1", "2026-07-20T10:00:00", "lecture-1.pdf", ["Shared ___"]),
      ],
      [],
    );

    expect(materials).toHaveLength(1);
    expect(materials[0].sessions).toHaveLength(2);
    expect(materials[0].questions.map((item) => item.prompt)).toEqual(["Fresh ___", "Shared ___"]);
  });

  it("orders materials by most recent practice", () => {
    const materials = groupStudyMaterials(
      [
        session("s1", "2026-07-20T10:00:00", "old.pdf", ["A ___"]),
        session("s2", "2026-07-27T10:00:00", "new.pdf", ["B ___"]),
      ],
      [],
    );
    expect(materials.map((item) => item.name)).toEqual(["new.pdf", "old.pdf"]);
  });

  it("keeps pre-existing practice visible under one labelled group", () => {
    const legacy: StudySession = {
      ...session("s1", "2026-07-19T10:00:00", "ignored.pdf", ["A ___"]),
      source: EMPTY_SOURCE,
    };
    const materials = groupStudyMaterials([legacy], []);

    expect(materials).toHaveLength(1);
    expect(materials[0].name).toBe(UNGROUPED_NAME);
    expect(materials[0].questions).toHaveLength(1);
  });

  it("still groups a mistake whose material has no surviving session", () => {
    const materials = groupStudyMaterials(
      [],
      [mistake("A ___", "deleted-quiz.pdf", "2026-07-27T10:05:00")],
    );

    expect(materials).toHaveLength(1);
    expect(materials[0].name).toBe("deleted-quiz.pdf");
    expect(materials[0].questions).toEqual([]);
    expect(materials[0].mistakes).toHaveLength(1);
  });

  it("adds uploaded PDFs that do not have a quiz session yet", () => {
    const library: StudyLibraryRecord[] = [
      {
        id: "new.pdf::200",
        name: "new.pdf",
        uploadedAt: "2026-07-28T10:00:00",
        lastOpenedAt: "",
      },
    ];

    const materials = mergeStudyLibraryMaterials([], library);

    expect(materials).toEqual([
      {
        id: "new.pdf::200",
        name: "new.pdf",
        sessions: [],
        questions: [],
        mistakes: [],
        lastPracticedAt: "",
      },
    ]);
  });

  it("does not add an invalid blank library record", () => {
    const materials = mergeStudyLibraryMaterials(
      [],
      [
        { id: "", name: "", uploadedAt: "", lastOpenedAt: "" },
        { id: "pdf-1", name: "biology.pdf", uploadedAt: "2026-08-05T10:00:00.000Z", lastOpenedAt: "" },
      ],
    );

    expect(materials.map((material) => material.id)).toEqual(["pdf-1"]);
  });
});
