import { describe, expect, it } from "vitest";
import type { Quiz } from "@/lib/quiz";
import { buildSharedChallenge, getChallengeShareUrl } from "@/lib/shared-challenge";

const quiz: Quiz = {
  title: "Probability warm-up",
  summary: "A short review set.",
  questions: [
    {
      id: "mc-1",
      type: "multiple_choice",
      prompt: "Which event is independent?",
      explanation: "Independence means one event does not change the other probability.",
      sourceNote: "Lecture 1",
      options: [
        { id: "a", text: "A" },
        { id: "b", text: "B" },
        { id: "c", text: "C" },
        { id: "d", text: "D" },
      ],
      correctOptionId: "b",
    },
    {
      id: "fill-1",
      type: "fill_blank",
      prompt: "Fill in the missing term.",
      explanation: "The denominator normalizes the probability.",
      sourceNote: "Homework 1",
      acceptedAnswers: ["denominator", "the denominator"],
      referenceAnswer: "denominator",
    },
    {
      id: "written-1",
      type: "short_answer",
      prompt: "Explain conditional probability.",
      explanation: "It describes a probability after observing an event.",
      sourceNote: "Lecture 1",
      referenceAnswer: "The probability of A given B.",
      gradingCriteria: ["Defines conditioning event"],
      customLabel: null,
    },
  ],
};

describe("buildSharedChallenge", () => {
  it("keeps questions playable without exposing answers or original material metadata", () => {
    const challenge = buildSharedChallenge(quiz);

    expect(challenge.publicQuiz).toEqual({
      title: "Probability warm-up",
      summary: "A short review set.",
      questions: [
        {
          id: "mc-1",
          type: "multiple_choice",
          prompt: "Which event is independent?",
          options: [
            { id: "a", text: "A" },
            { id: "b", text: "B" },
            { id: "c", text: "C" },
            { id: "d", text: "D" },
          ],
        },
        {
          id: "fill-1",
          type: "fill_blank",
          prompt: "Fill in the missing term.",
        },
        {
          id: "written-1",
          type: "short_answer",
          prompt: "Explain conditional probability.",
          customLabel: null,
        },
      ],
    });
    expect(JSON.stringify(challenge.publicQuiz)).not.toMatch(
      /correctOptionId|acceptedAnswers|referenceAnswer|sourceNote|gradingCriteria/,
    );
  });

  it("retains answer data only in the private answer key", () => {
    const challenge = buildSharedChallenge(quiz);

    expect(challenge.answerKey.questions).toEqual([
      {
        id: "mc-1",
        type: "multiple_choice",
        correctOptionId: "b",
        explanation: "Independence means one event does not change the other probability.",
      },
      {
        id: "fill-1",
        type: "fill_blank",
        acceptedAnswers: ["denominator", "the denominator"],
        referenceAnswer: "denominator",
        explanation: "The denominator normalizes the probability.",
      },
      {
        id: "written-1",
        type: "short_answer",
        referenceAnswer: "The probability of A given B.",
        explanation: "It describes a probability after observing an event.",
      },
    ]);
  });
});

describe("getChallengeShareUrl", () => {
  it("creates a stable public challenge URL from the deployment origin and slug", () => {
    expect(getChallengeShareUrl("https://paperquiz.example/", "abc123")).toBe(
      "https://paperquiz.example/challenge/abc123",
    );
  });
});
