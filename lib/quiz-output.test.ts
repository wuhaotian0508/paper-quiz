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
            { id: "a", text: "Heat energy" },
            { id: "b", text: "Chemical energy" },
            { id: "c", text: "Sound energy" },
            { id: "d", text: "Mechanical energy" },
          ],
          correctOptionId: "b",
          explanation: "The source states that light energy is converted into chemical energy.",
          sourceNote: "Page 1",
        },
      ],
    });
  });
});
