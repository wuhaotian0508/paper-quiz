import { describe, expect, it } from "vitest";
import {
  assertQuizMatchesQuestionConfiguration,
  normalizeAnswer,
  parseQuestionConfiguration,
  parseSettings,
  type Quiz,
} from "./quiz";

describe("parseSettings", () => {
  it("normalizes fill-blank answers for matching", () => {
    expect(normalizeAnswer("  Retrieval-Augmented  Generation ")).toBe(
      "retrieval augmented generation",
    );
  });
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
  // The UI no longer creates custom types, but a browser on the previous bundle still can.
  it("accepts fixed and custom question quantities", () => {
    expect(
      parseQuestionConfiguration(
        JSON.stringify([
          { type: "multiple_choice", count: 2 },
          { type: "custom", count: 1, label: "Calculation", instructions: "Show each step." },
        ]),
      ),
    ).toEqual([
      { type: "multiple_choice", count: 2 },
      { type: "custom", count: 1, label: "Calculation", instructions: "Show each step." },
    ]);
  });

  it("rejects custom question types without requirements", () => {
    expect(() =>
      parseQuestionConfiguration(
        JSON.stringify([{ type: "custom", count: 1, label: "Calculation", instructions: "" }]),
      ),
    ).toThrow("Question configuration is invalid");
  });
});

describe("assertQuizMatchesQuestionConfiguration", () => {
  const quiz: Quiz = {
    title: "Review",
    summary: "A source-grounded review.",
    questions: [
      {
        id: "q1",
        type: "multiple_choice",
        prompt: "What is retrieval?",
        options: [
          { id: "a", text: "Finding relevant context" },
          { id: "b", text: "Deleting context" },
          { id: "c", text: "Ignoring context" },
          { id: "d", text: "Inventing context" },
        ],
        correctOptionId: "a",
        explanation: "It finds relevant context.",
        sourceNote: "Lecture 1",
      },
    ],
  };

  it("accepts the server-configured type mix", () => {
    expect(() =>
      assertQuizMatchesQuestionConfiguration(quiz, [{ type: "multiple_choice", count: 1 }]),
    ).not.toThrow();
  });

  it("rejects a model response that changes the requested type or count", () => {
    expect(() =>
      assertQuizMatchesQuestionConfiguration(quiz, [{ type: "fill_blank", count: 1 }]),
    ).toThrow("Quiz question types do not match the requested configuration.");
    expect(() =>
      assertQuizMatchesQuestionConfiguration(quiz, [{ type: "multiple_choice", count: 2 }]),
    ).toThrow("Quiz question types do not match the requested configuration.");
  });
});
