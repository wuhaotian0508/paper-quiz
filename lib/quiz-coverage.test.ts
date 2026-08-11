import { describe, expect, it, vi } from "vitest";
import {
  assertDistinctQuizQuestions,
  generateDistinctQuiz,
  largestTopicShare,
  quizClustersOnOneTopic,
} from "./quiz-coverage";
import type { Quiz } from "./quiz";

/** A quiz of `topics.length` questions, each labelled with the topic at its index. */
const quizWithTopics = (topics: (string | null)[]): Quiz => ({
  title: "Chapter review",
  summary: "Practice the chapter.",
  questions: topics.map((topic, index) => ({
    id: `q${index + 1}`,
    type: "fill_blank" as const,
    prompt: `Question ${index + 1} about ${topic ?? "something"}?`,
    acceptedAnswers: [`answer ${index + 1}`],
    referenceAnswer: `answer ${index + 1}`,
    explanation: `Because of reason ${index + 1}.`,
    sourceNote: "Lecture 1",
    topic,
  })),
});

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

describe("quizClustersOnOneTopic", () => {
  it("counts the questions sitting on the most-covered topic", () => {
    expect(largestTopicShare(quizWithTopics(["Vectors", "Vectors", "Matrices"]))).toBe(2);
  });

  it("treats topics that differ only in case and spacing as the same section", () => {
    expect(largestTopicShare(quizWithTopics(["Vectors", " vectors ", "Matrices"]))).toBe(2);
  });

  it("reports no clustering for a quiz saved before questions carried a topic", () => {
    expect(largestTopicShare(quizWithTopics([null, null, null, null]))).toBe(0);
    expect(quizClustersOnOneTopic(quizWithTopics([null, null, null, null]))).toBe(false);
  });

  it("flags a set that puts more than half its questions on one topic", () => {
    expect(
      quizClustersOnOneTopic(quizWithTopics(["Vectors", "Vectors", "Vectors", "Matrices"])),
    ).toBe(true);
  });

  it("allows a leaning set, because a narrow source is not a broken quiz", () => {
    expect(
      quizClustersOnOneTopic(quizWithTopics(["Vectors", "Vectors", "Matrices", "Bases"])),
    ).toBe(false);
  });

  it("stays out of the way below four questions, where there is no spread to judge", () => {
    expect(quizClustersOnOneTopic(quizWithTopics(["Vectors", "Vectors", "Vectors"]))).toBe(false);
  });
});

describe("generateDistinctQuiz coverage correction", () => {
  const clustered = quizWithTopics(["Vectors", "Vectors", "Vectors", "Matrices"]);
  const spread = quizWithTopics(["Vectors", "Vectors", "Matrices", "Bases"]);

  it("asks for one corrected set when the first quiz clusters on a single topic", async () => {
    const generate = vi.fn().mockResolvedValueOnce(clustered).mockResolvedValueOnce(spread);

    await expect(generateDistinctQuiz(generate)).resolves.toEqual(spread);
    expect(generate).toHaveBeenCalledTimes(2);
    expect(generate).toHaveBeenLastCalledWith(expect.stringContaining("single topic"));
  });

  it("keeps a still-clustered retry rather than losing the learner's quiz to the heuristic", async () => {
    const generate = vi.fn().mockResolvedValue(clustered);

    await expect(generateDistinctQuiz(generate)).resolves.toEqual(clustered);
    expect(generate).toHaveBeenCalledTimes(2);
  });

  it("does not spend a retry on a set that is already spread across topics", async () => {
    const generate = vi.fn().mockResolvedValue(spread);

    await expect(generateDistinctQuiz(generate)).resolves.toEqual(spread);
    expect(generate).toHaveBeenCalledTimes(1);
  });
});
