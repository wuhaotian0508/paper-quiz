import { describe, expect, it } from "vitest";
import { buildMaterialReviewSheet } from "./material-review-sheet";
import type { StudyMaterial } from "./study-material";

const material: StudyMaterial = {
  id: "strategy::1000",
  name: "Strategy.pdf",
  sessions: [],
  questions: [
    {
      id: "q1",
      type: "multiple_choice",
      prompt: "What is a competitive advantage?",
      options: [
        { id: "a", text: "A defensible edge" },
        { id: "b", text: "A price list" },
        { id: "c", text: "A supplier" },
        { id: "d", text: "A logo" },
      ],
      correctOptionId: "a",
      explanation: "It is an edge over competitors.",
      sourceNote: "Page 5 - Competitive advantage",
    },
    {
      id: "q2",
      type: "fill_blank",
      prompt: "A durable advantage can come from ___.",
      acceptedAnswers: ["switching costs"],
      referenceAnswer: "Switching costs",
      explanation: "They make switching harder.",
      sourceNote: "Page 24 - Seven Powers",
    },
  ],
  mistakes: [
    {
      version: 1,
      id: "m1",
      question: {
        id: "q2",
        type: "fill_blank",
        prompt: "A durable advantage can come from ___.",
        acceptedAnswers: ["switching costs"],
        referenceAnswer: "Switching costs",
        explanation: "They make switching harder.",
        sourceNote: "Page 24 - Seven Powers",
      },
      answer: "network effects",
      status: "incorrect",
      score: 0,
      feedback: "Review the source of durable advantages.",
      missingPoints: ["Switching costs retain customers."],
      updatedAt: "2026-07-29T10:00:00.000Z",
      source: {
        fileId: null,
        transcript: "",
        materialId: "strategy::1000",
        materialName: "Strategy.pdf",
      },
    },
  ],
  lastPracticedAt: "2026-07-29T10:00:00.000Z",
};

describe("buildMaterialReviewSheet", () => {
  it("keeps review content scoped to one PDF's saved questions and mistakes", () => {
    const sheet = buildMaterialReviewSheet(material);

    expect(sheet.title).toBe("Strategy.pdf Review Sheet");
    expect(sheet.questionCount).toBe(2);
    expect(sheet.mistakeCount).toBe(1);
    expect(sheet.weaknesses).toHaveLength(1);
    expect(sheet.weaknesses[0]).toMatchObject({
      prompt: "A durable advantage can come from ___.",
      keyAnswer: "Switching costs",
      remember: "Switching costs retain customers.",
    });
    expect(sheet.coverage).toEqual([
      { sourceNote: "Page 5 - Competitive advantage", questionCount: 1 },
      { sourceNote: "Page 24 - Seven Powers", questionCount: 1 },
    ]);
  });
});
