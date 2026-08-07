import { describe, expect, it } from "vitest";
import { parseQuizOutput } from "./quiz-output";

describe("parseQuizOutput", () => {
  it("accepts discriminated fill-blank and written questions", () => {
    const output = JSON.stringify({
      title: "Review",
      summary: "Mixed practice",
      questions: [
        {
          id: "q1",
          type: "fill_blank",
          prompt: "RAG means ___",
          acceptedAnswers: ["retrieval augmented generation"],
          referenceAnswer: "Retrieval-augmented generation",
          explanation: "The acronym expands this way.",
          sourceNote: "Page 1",
        },
        {
          id: "q2",
          type: "short_answer",
          customLabel: null,
          prompt: "Explain RAG.",
          referenceAnswer: "Retrieve context before generation.",
          gradingCriteria: ["mentions retrieval", "mentions generation"],
          explanation: "It grounds a model with retrieved context.",
          sourceNote: "Page 2",
        },
      ],
    });

    expect(
      parseQuizOutput(output, "lecture.pdf").questions.map((question) => question.type),
    ).toEqual(["fill_blank", "short_answer"]);
  });

  it("makes repeated question ids unique so answer state cannot collide", () => {
    const question = {
      type: "fill_blank",
      acceptedAnswers: ["yes"],
      referenceAnswer: "Yes",
      explanation: "Because.",
      sourceNote: "Page 1",
    };
    const output = JSON.stringify({
      title: "Review",
      summary: "Mixed practice",
      questions: [
        { ...question, id: "q1", prompt: "First ___" },
        { ...question, id: "q1", prompt: "Second ___" },
        { ...question, id: "q1", prompt: "Third ___" },
      ],
    });

    const ids = parseQuizOutput(output, "lecture.pdf").questions.map((item) => item.id);
    expect(new Set(ids).size).toBe(3);
    expect(ids[0]).toBe("q1");
  });

  it("rejects repeated question prompts instead of serving duplicate practice", () => {
    const question = {
      type: "fill_blank",
      acceptedAnswers: ["retrieval augmented generation"],
      referenceAnswer: "Retrieval-augmented generation",
      explanation: "It combines retrieval and generation.",
      sourceNote: "Page 1",
    };
    const output = JSON.stringify({
      title: "Review",
      summary: "Practice",
      questions: [
        { ...question, id: "q1", prompt: "What does RAG stand for?" },
        { ...question, id: "q2", prompt: "WHAT does RAG stand for?!" },
      ],
    });

    expect(() => parseQuizOutput(output, "lecture.pdf")).toThrow("repeated question");
  });

  it("accepts a hyphenated multiple-choice type returned for a PDF", () => {
    const output = JSON.stringify({
      title: "Business Strategy Basics",
      summary: "A basic question about competitive advantage.",
      questions: [
        {
          id: "q1",
          type: "multiple-choice",
          prompt: "What is competitive advantage?",
          options: [
            { id: "a", text: "A business doing something better than competitors" },
            { id: "b", text: "A list of suppliers" },
            { id: "c", text: "A market regulation" },
            { id: "d", text: "A marketing budget" },
          ],
          correctOptionId: "a",
          explanation: "It explains why a business performs better than competitors.",
          sourceNote: "Page 5, Competitive advantage",
          customLabel: null,
        },
      ],
    });

    expect(parseQuizOutput(output, "topic-9.pdf").questions[0].type).toBe("multiple_choice");
  });

  it("accepts a camel-cased multipleChoice type returned for a PDF", () => {
    const output = JSON.stringify({
      title: "Business Strategy Fundamentals",
      summary: "A basic question about competitive advantage.",
      questions: [
        {
          id: "q1",
          type: "multipleChoice",
          prompt: "What is competitive advantage?",
          options: [
            { id: "a", text: "A business doing something better than competitors" },
            { id: "b", text: "A list of suppliers" },
            { id: "c", text: "A market regulation" },
            { id: "d", text: "A marketing budget" },
          ],
          correctOptionId: "a",
          explanation: "It explains why a business performs better than competitors.",
          sourceNote: "Page 5, Competitive advantage",
          customLabel: null,
        },
      ],
    });

    expect(parseQuizOutput(output, "topic-9.pdf").questions[0].type).toBe("multiple_choice");
  });

  it("accepts camel-cased fillBlank and shortAnswer types returned for a PDF", () => {
    const output = JSON.stringify({
      title: "Review",
      summary: "Mixed practice",
      questions: [
        {
          id: "q1",
          type: "fillBlank",
          prompt: "A durable advantage can come from ___.",
          acceptedAnswers: ["switching costs"],
          referenceAnswer: "Switching costs",
          explanation: "They make it costly for customers to change providers.",
          sourceNote: "Page 24",
        },
        {
          id: "q2",
          type: "shortAnswer",
          prompt: "Explain switching costs.",
          referenceAnswer: "They make customers reluctant to change providers.",
          gradingCriteria: ["mentions cost of changing", "mentions customer retention"],
          customLabel: null,
          explanation: "They can create a durable advantage.",
          sourceNote: "Page 24",
        },
      ],
    });

    expect(
      parseQuizOutput(output, "topic-9.pdf").questions.map((question) => question.type),
    ).toEqual(["fill_blank", "short_answer"]);
  });

  it("reports the invalid field from an object quiz instead of treating it as a legacy array", () => {
    const output = JSON.stringify({
      title: "Review",
      summary: "One question",
      questions: [
        {
          id: "q1",
          type: "essay",
          prompt: "Explain.",
          explanation: "Because.",
          sourceNote: "Page 1",
        },
      ],
    });

    expect(() => parseQuizOutput(output, "lecture.pdf")).toThrow(/questions[\s\S]*type/);
  });

  it("normalizes a fenced CRS question array with English fallback copy", () => {
    const output = `\`\`\`json
[
  {
    "question": "What does photosynthesis convert light energy into?",
    "options": {"a":"Heat energy","b":"Chemical energy","c":"Sound energy","d":"Mechanical energy"},
    "answer": "b",
    "explanation": "The source states that light energy is converted into chemical energy.",
    "sourceNote": "Page 1"
  }
]
\`\`\``;

    expect(parseQuizOutput(output, "lecture.pdf")).toEqual({
      title: "lecture.pdf Review Quiz",
      summary: "A review quiz generated from the uploaded PDF.",
      questions: [
        {
          id: "q1",
          type: "multiple_choice",
          prompt: "What does photosynthesis convert light energy into?",
          options: [
            { id: "a", text: "Heat energy", explanation: null },
            { id: "b", text: "Chemical energy", explanation: null },
            { id: "c", text: "Sound energy", explanation: null },
            { id: "d", text: "Mechanical energy", explanation: null },
          ],
          correctOptionId: "b",
          explanation: "The source states that light energy is converted into chemical energy.",
          sourceNote: "Page 1",
        },
      ],
    });
  });
});
