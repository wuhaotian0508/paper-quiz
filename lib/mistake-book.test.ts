import { describe, expect, it } from "vitest";
import { addMistake, readMistakes } from "./mistake-book";
import { MASTERED_BOX } from "./review-schedule";
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

  it("keeps mistakes from different quizzes that reuse the same generated id", () => {
    // The model numbers questions per quiz, so a second quiz starts at q1 again.
    const fromNextQuiz: Question = {
      ...question,
      id: "q1",
      prompt: "What does a vector database store?",
    };
    const first = addMistake([], question, "retrieval generation", {
      status: "incorrect",
      score: 0,
      feedback: "Missing augmented.",
      missingPoints: [],
    });
    const both = addMistake(first, fromNextQuiz, "documents", {
      status: "incorrect",
      score: 0,
      feedback: "It stores embeddings.",
      missingPoints: [],
    });

    expect(both).toHaveLength(2);
    expect(both.map((entry) => entry.question.prompt)).toEqual([
      "What does a vector database store?",
      "What does RAG stand for?",
    ]);
  });

  it("still updates in place when the same question is missed again after a reload", () => {
    const saved = JSON.stringify(
      addMistake([], question, "retrieval generation", {
        status: "incorrect",
        score: 0,
        feedback: "Missing augmented.",
        missingPoints: [],
      }),
    );
    const reloaded = readMistakes(saved);
    const updated = addMistake(reloaded, question, "RAG", {
      status: "partial",
      score: 0.5,
      feedback: "Use the full term.",
      missingPoints: [],
    });

    expect(updated).toHaveLength(1);
    expect(updated[0]).toMatchObject({ answer: "RAG", status: "partial" });
  });

  it("keeps a book saved before material tracking existed", () => {
    // Shapes written by earlier releases: no source at all, and a source without a material.
    const saved = JSON.stringify([
      {
        version: 1,
        id: "q1",
        question,
        answer: "a",
        status: "incorrect",
        score: 0,
        feedback: "Review it.",
        missingPoints: [],
        updatedAt: "2026-07-27T12:00:00",
        source: { fileId: "file-abc123", transcript: "" },
      },
      {
        version: 1,
        id: "q2",
        question: { ...question, prompt: "Older entry ___" },
        answer: "b",
        status: "incorrect",
        score: 0,
        feedback: "Review it.",
        missingPoints: [],
        updatedAt: "2026-07-20T12:00:00",
      },
    ]);

    const entries = readMistakes(saved);
    expect(entries).toHaveLength(2);
    expect(entries[0].source).toEqual({
      fileId: "file-abc123",
      transcript: "",
      materialId: "",
      materialName: "",
    });
    expect(entries[1].source.materialId).toBe("");
  });

  it("ignores malformed saved data", () => {
    expect(readMistakes("not json")).toEqual([]);
  });

  it("promotes a card up the ladder when a saved mistake is answered correctly", () => {
    const missed = addMistake(
      [],
      question,
      "retrieval generation",
      { status: "incorrect", score: 0, feedback: "Missing augmented.", missingPoints: [] },
      undefined,
      new Date("2026-08-03T09:00:00"),
    );

    const promoted = addMistake(
      missed,
      question,
      "retrieval augmented generation",
      { status: "correct", score: 1, feedback: "Correct.", missingPoints: [] },
      undefined,
      new Date("2026-08-04T09:00:00"),
    );

    expect(promoted).toHaveLength(1);
    expect(promoted[0].review?.box).toBe(1);
    // The wrong answer is what the entry is for, so it survives the promotion.
    expect(promoted[0]).toMatchObject({ answer: "retrieval generation", status: "incorrect" });
  });

  it("removes a card that graduates from the last box", () => {
    const nearlyMastered = addMistake(
      [],
      question,
      "retrieval generation",
      { status: "incorrect", score: 0, feedback: "Missing augmented.", missingPoints: [] },
      undefined,
      new Date("2026-08-03T09:00:00"),
    ).map((entry) => ({ ...entry, review: { ...entry.review!, box: MASTERED_BOX - 1 } }));

    const graduated = addMistake(
      nearlyMastered,
      question,
      "retrieval augmented generation",
      { status: "correct", score: 1, feedback: "Correct.", missingPoints: [] },
      undefined,
      new Date("2026-08-04T09:00:00"),
    );

    expect(graduated).toEqual([]);
  });

  it("records nothing when a question that was never missed is answered correctly", () => {
    expect(
      addMistake([], question, "retrieval augmented generation", {
        status: "correct",
        score: 1,
        feedback: "Correct.",
        missingPoints: [],
      }),
    ).toEqual([]);
  });

  it("sends a repeat mistake back to the first box and counts the lapse", () => {
    const advanced = addMistake(
      [],
      question,
      "retrieval generation",
      { status: "incorrect", score: 0, feedback: "Missing augmented.", missingPoints: [] },
      undefined,
      new Date("2026-08-03T09:00:00"),
    ).map((entry) => ({ ...entry, review: { ...entry.review!, box: 3 } }));

    const relapsed = addMistake(
      advanced,
      question,
      "generation",
      { status: "incorrect", score: 0, feedback: "Still missing it.", missingPoints: [] },
      undefined,
      new Date("2026-08-10T09:00:00"),
    );

    expect(relapsed[0].review).toMatchObject({ box: 0, lapses: 1 });
  });
});
