import { describe, expect, it } from "vitest";
import {
  calculateScore,
  parseSettings,
  parseQuestionConfiguration,
  type Quiz,
} from "./quiz";

const quiz: Quiz = {
  title: "Practice Quiz",
  summary: "Test knowledge points",
  questions: [
    {
      id: "q1",
      type: "multiple_choice",
      prompt: "Which option is correct?",
      options: [
        { id: "a", text: "Option A" },
        { id: "b", text: "Option B" },
        { id: "c", text: "Option C" },
        { id: "d", text: "Option D" },
      ],
      correctOptionId: "b",
      explanation: "Option B matches the question.",
      sourceNote: "Page 1",
    },
  ],
};

describe("parseSettings", () => {
  it("parses supported count and difficulty", () => {
    expect(parseSettings("5", "basic")).toEqual({
      count: 5,
      difficulty: "basic",
    });
  });

  it("rejects unsupported question count in English", () => {
    expect(() => parseSettings("7", "basic")).toThrow("Question count is invalid");
  });
});

describe("parseQuestionConfiguration", () => {
  it("accepts fixed and custom question quantities", () => {
    expect(parseQuestionConfiguration(JSON.stringify([
      { type: "multiple_choice", count: 2 },
      { type: "custom", count: 1, label: "Calculation", instructions: "Show each step." },
    ]))).toEqual([
      { type: "multiple_choice", count: 2 },
      { type: "custom", count: 1, label: "Calculation", instructions: "Show each step." },
    ]);
  });

  it("rejects custom question types without requirements", () => {
    expect(() => parseQuestionConfiguration(JSON.stringify([
      { type: "custom", count: 1, label: "Calculation", instructions: "" },
    ]))).toThrow("Question configuration is invalid");
  });
});

describe("calculateScore", () => {
  it("counts correct answers against the quiz", () => {
    expect(calculateScore(quiz, { q1: "b" })).toEqual({ correct: 1, total: 1 });
    expect(calculateScore(quiz, { q1: "a" })).toEqual({ correct: 0, total: 1 });
  });
});
