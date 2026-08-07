import { describe, expect, it } from "vitest";
import type { MistakeBookEntry } from "@/lib/mistake-book";
import { buildWeaknessReviewSheet } from "@/lib/review-sheet";

const entry = (id: string, score: number, updatedAt: string, missingPoints: string[] = []) =>
  ({
    version: 1,
    id,
    status: "incorrect",
    score,
    feedback: `Feedback for ${id}`,
    missingPoints,
    updatedAt,
    answer: "wrong",
    source: { fileId: null, transcript: "", materialId: "", materialName: "" },
    question: {
      id,
      type: "multiple_choice",
      prompt: `Question ${id}`,
      explanation: `Explanation ${id}`,
      sourceNote: "Private lecture",
      options: [
        { id: "a", text: "Wrong" },
        { id: "b", text: "Right" },
        { id: "c", text: "No" },
        { id: "d", text: "No" },
      ],
      correctOptionId: "b",
    },
  }) as MistakeBookEntry;

describe("buildWeaknessReviewSheet", () => {
  it("prioritizes the lowest-scoring, most recent weak areas and gives a concise review prompt", () => {
    const sheet = buildWeaknessReviewSheet([
      entry("older-partial", 0.5, "2026-07-01T12:00:00.000Z"),
      entry("recent-zero", 0, "2026-07-28T12:00:00.000Z", ["Use the denominator"]),
      entry("old-zero", 0, "2026-07-01T12:00:00.000Z"),
    ]);

    expect(sheet.items.map((item) => item.id)).toEqual([
      "recent-zero",
      "old-zero",
      "older-partial",
    ]);
    expect(sheet.items[0]).toMatchObject({
      prompt: "Question recent-zero",
      keyAnswer: "Right",
      remember: "Use the denominator",
      action: "Try this question again before checking the answer.",
    });
  });

  it("carries the citing material and page so the sheet can show its slide", () => {
    const withSource = {
      ...entry("cited", 0, "2026-07-28T12:00:00.000Z"),
      source: { fileId: null, transcript: "", materialId: "m1", materialName: "Lecture.pdf" },
    } as MistakeBookEntry;
    withSource.question.sourceNote = "Page 5, Different types of AI";

    expect(buildWeaknessReviewSheet([withSource]).items[0]).toMatchObject({
      materialId: "m1",
      sourceNote: "Page 5, Different types of AI",
    });
  });

  it("keeps no file handle or file name, so the sheet stays safe to export", () => {
    const withSource = {
      ...entry("cited", 0, "2026-07-28T12:00:00.000Z"),
      source: {
        fileId: "file-secret123",
        transcript: "private lecture text",
        materialId: "m1",
        materialName: "Confidential.pdf",
      },
    } as MistakeBookEntry;

    const serialized = JSON.stringify(buildWeaknessReviewSheet([withSource]));
    expect(serialized).not.toContain("file-secret123");
    expect(serialized).not.toContain("Confidential.pdf");
    expect(serialized).not.toContain("private lecture text");
  });

  it("falls back to empty source fields when the mistake predates source tracking", () => {
    expect(
      buildWeaknessReviewSheet([entry("old", 0, "2026-07-01T12:00:00.000Z")])["items"][0],
    ).toMatchObject({ materialId: "", sourceNote: "Private lecture" });
  });

  it("caps the sheet at eight focused weak areas", () => {
    const entries = Array.from({ length: 10 }, (_, index) =>
      entry(`q-${index}`, 0, `2026-07-${String(index + 1).padStart(2, "0")}T12:00:00.000Z`),
    );

    expect(buildWeaknessReviewSheet(entries).items).toHaveLength(8);
  });
});
