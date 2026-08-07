import { describe, expect, it } from "vitest";
import {
  buildDailyReviewPapers,
  MAX_PAPER_QUESTIONS,
  totalDueCount,
  totalPaperQuestions,
} from "./daily-review";
import type { MistakeBookEntry } from "./mistake-book";
import type { ReviewState } from "./review-schedule";
import type { StudyLibraryRecord } from "./study-library";

const today = new Date("2026-08-06T09:00:00");

const review = (dueAt: string, box = 0): ReviewState => ({
  version: 1,
  box,
  dueAt: new Date(dueAt).toISOString(),
  lastReviewedAt: "2026-08-01T09:00:00.000Z",
  lapses: 0,
});

const mistake = (id: string, materialId: string, state: ReviewState): MistakeBookEntry => ({
  version: 1,
  id,
  question: {
    id: "q1",
    type: "fill_blank",
    prompt: `${id} ____`,
    acceptedAnswers: ["x"],
    referenceAnswer: "x",
    explanation: "x",
    sourceNote: "Lecture",
  },
  answer: "wrong",
  status: "incorrect",
  score: 0,
  feedback: "Review it.",
  missingPoints: [],
  updatedAt: "2026-08-01T09:00:00.000Z",
  source: { fileId: null, transcript: "", materialId, materialName: `${materialId}.pdf` },
  review: state,
});

const material = (id: string, subject: string): StudyLibraryRecord => ({
  id,
  name: `${id}.pdf`,
  uploadedAt: "2026-07-01T09:00:00.000Z",
  lastOpenedAt: "",
  subject,
  updatedAt: "2026-07-01T09:00:00.000Z",
});

const library = [material("ugba", "UGBA 117"), material("math", "MATH 1A")];

describe("daily review papers", () => {
  it("builds one paper per course from what is due today", () => {
    const mistakes = [
      mistake("a", "ugba", review("2026-08-06T00:00:00")),
      mistake("b", "math", review("2026-08-05T00:00:00")),
      mistake("c", "ugba", review("2026-08-01T00:00:00")),
    ];

    const papers = buildDailyReviewPapers(mistakes, library, today);

    expect(papers.map((paper) => paper.subject)).toEqual(["MATH 1A", "UGBA 117"]);
    expect(papers.find((paper) => paper.subject === "UGBA 117")?.dueCount).toBe(2);
  });

  it("leaves out cards that are not due yet", () => {
    const mistakes = [
      mistake("due", "ugba", review("2026-08-06T00:00:00")),
      mistake("later", "ugba", review("2026-08-20T00:00:00")),
    ];

    const papers = buildDailyReviewPapers(mistakes, library, today);

    expect(papers).toHaveLength(1);
    expect(papers[0].entries.map((entry) => entry.id)).toEqual(["due"]);
  });

  it("omits courses with nothing due rather than returning an empty paper", () => {
    const papers = buildDailyReviewPapers(
      [mistake("a", "ugba", review("2026-08-06T00:00:00"))],
      library,
      today,
    );

    expect(papers.map((paper) => paper.subject)).toEqual(["UGBA 117"]);
  });

  it("puts the most overdue question first and counts how many are behind", () => {
    const mistakes = [
      mistake("today", "ugba", review("2026-08-06T00:00:00")),
      mistake("late", "ugba", review("2026-07-20T00:00:00")),
      mistake("later-still", "ugba", review("2026-07-10T00:00:00")),
    ];

    const [paper] = buildDailyReviewPapers(mistakes, library, today);

    expect(paper.entries.map((entry) => entry.id)).toEqual(["later-still", "late", "today"]);
    expect(paper.overdueCount).toBe(2);
  });

  it("caps a paper but keeps the overflow counted as due", () => {
    const mistakes = Array.from({ length: MAX_PAPER_QUESTIONS + 5 }, (_, index) =>
      mistake(`q${index}`, "ugba", review("2026-08-06T00:00:00")),
    );

    const [paper] = buildDailyReviewPapers(mistakes, library, today);

    expect(paper.entries).toHaveLength(MAX_PAPER_QUESTIONS);
    expect(paper.dueCount).toBe(MAX_PAPER_QUESTIONS + 5);
    expect(totalPaperQuestions([paper])).toBe(MAX_PAPER_QUESTIONS);
    expect(totalDueCount([paper])).toBe(MAX_PAPER_QUESTIONS + 5);
  });

  it("collects mistakes from a material with no subject into an unassigned paper, listed last", () => {
    const mistakes = [
      mistake("unfiled", "loose", review("2026-08-06T00:00:00")),
      mistake("filed", "ugba", review("2026-08-06T00:00:00")),
    ];

    const papers = buildDailyReviewPapers(mistakes, library, today);

    expect(papers.map((paper) => paper.subject)).toEqual(["UGBA 117", ""]);
  });

  it("gives a book saved before scheduling existed a paper straight away", () => {
    const legacy: MistakeBookEntry = {
      ...mistake("old", "ugba", review("2026-08-06T00:00:00")),
      updatedAt: "2026-07-01T09:00:00.000Z",
      review: undefined,
    };

    const [paper] = buildDailyReviewPapers([legacy], library, today);

    expect(paper.entries.map((entry) => entry.id)).toEqual(["old"]);
  });

  it("returns nothing when the book is empty", () => {
    expect(buildDailyReviewPapers([], library, today)).toEqual([]);
  });
});
