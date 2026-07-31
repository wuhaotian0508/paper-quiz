import { describe, expect, it, vi } from "vitest";
import { assertDistinctQuizQuestions, generateDistinctQuiz } from "./quiz-coverage";
import type { Quiz } from "./quiz";

const baseQuiz: Quiz = {
  title: "RAG review",
  summary: "Practice retrieval concepts.",
  questions: [
    {
      id: "q1",
      type: "multiple_choice",
      prompt: "What does retrieval-augmented generation add before answering?",
      options: [
        { id: "a", text: "Retrieved context" },
        { id: "b", text: "Random noise" },
        { id: "c", text: "A second user" },
        { id: "d", text: "A database deletion" },
      ],
      correctOptionId: "a",
      explanation: "It grounds the answer with retrieved material.",
      sourceNote: "Lecture 1",
    },
  ],
};

describe("assertDistinctQuizQuestions", () => {
  it("rejects the same question even when its punctuation and capitalization differ", () => {
    const quiz: Quiz = {
      ...baseQuiz,
      questions: [
        ...baseQuiz.questions,
        {
          ...baseQuiz.questions[0],
          id: "q2",
          prompt: "WHAT does retrieval augmented generation add before answering?!",
        },
      ],
    };

    expect(() => assertDistinctQuizQuestions(quiz)).toThrow("repeated question");
  });

  it("allows separate questions that assess different concepts", () => {
    const quiz: Quiz = {
      ...baseQuiz,
      questions: [
        ...baseQuiz.questions,
        {
          ...baseQuiz.questions[0],
          id: "q2",
          prompt: "Why can grounding a response with retrieved sources reduce hallucinations?",
        },
      ],
    };

    expect(() => assertDistinctQuizQuestions(quiz)).not.toThrow();
  });

  it("asks for one corrected replacement set when the first generated quiz repeats a question", async () => {
    const duplicateQuiz: Quiz = {
      ...baseQuiz,
      questions: [...baseQuiz.questions, { ...baseQuiz.questions[0], id: "q2" }],
    };
    const generate = vi.fn().mockResolvedValueOnce(duplicateQuiz).mockResolvedValueOnce(baseQuiz);

    await expect(generateDistinctQuiz(generate)).resolves.toEqual(baseQuiz);
    expect(generate).toHaveBeenCalledTimes(2);
    expect(generate).toHaveBeenLastCalledWith(expect.stringContaining("repeated question"));
  });

  it("retries when the quiz parser reports a repeated question before returning a quiz", async () => {
    const generate = vi
      .fn()
      .mockRejectedValueOnce(new Error("Quiz contains a repeated question."))
      .mockResolvedValueOnce(baseQuiz);

    await expect(generateDistinctQuiz(generate)).resolves.toEqual(baseQuiz);
    expect(generate).toHaveBeenCalledTimes(2);
  });
});
