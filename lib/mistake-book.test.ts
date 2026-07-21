import { describe, expect, it } from "vitest";
import { addMistake, readMistakes } from "./mistake-book";
import type { Question } from "./quiz";

const question: Question = {
  id: "q1",
  type: "fill_blank",
  prompt: "What does RAG stand for?",
  acceptedAnswers: ["retrieval augmented generation"],
  referenceAnswer: "Retrieval-augmented generation.",
  explanation: "It retrieves relevant material before generating.",
  sourceNote: "Lecture 1",
};

describe("mistake book", () => {
  it("keeps one updated entry for repeated mistakes on the same question", () => {
    const first = addMistake([], question, "retrieval generation", {
      status: "incorrect",
      score: 0,
      feedback: "Missing augmented.",
      missingPoints: ["augmented"],
    });
    const updated = addMistake(first, question, "RAG", {
      status: "partial",
      score: 0.5,
      feedback: "Use the full term.",
      missingPoints: ["retrieval-augmented generation"],
    });

    expect(updated).toHaveLength(1);
    expect(updated[0]).toMatchObject({ answer: "RAG", status: "partial", score: 0.5 });
  });

  it("ignores malformed saved data", () => {
    expect(readMistakes("not json")).toEqual([]);
  });
});
