import { describe, expect, it } from "vitest";
import { ExamReviewSheetSchema } from "./exam-review";

describe("ExamReviewSheetSchema", () => {
  it("accepts a source-grounded set of compact review topics", () => {
    const sheet = ExamReviewSheetSchema.parse({
      title: "RAG Exam Review",
      topics: [
        {
          topic: "Retrieval",
          keyIdeas: ["Retrieve relevant context before generating."],
          formulaOrProcedure: "Retrieve, rank, then generate.",
          commonConfusion: "Retrieval supplements rather than retrains the model.",
          sourceNote: "Lecture 1, retrieval pipeline",
        },
        {
          topic: "Grounding",
          keyIdeas: ["Grounding ties claims to the supplied sources."],
          formulaOrProcedure: "",
          commonConfusion: "Grounding does not guarantee every source is correct.",
          sourceNote: "Lecture 1, evaluation",
        },
        {
          topic: "Evaluation",
          keyIdeas: ["Measure answer quality against supported facts."],
          formulaOrProcedure: "",
          commonConfusion: "Fluency alone is not evidence of correctness.",
          sourceNote: "Lecture 2, metrics",
        },
        {
          topic: "Failure modes",
          keyIdeas: ["Poor retrieval can still cause unsupported answers."],
          formulaOrProcedure: "Inspect retrieved evidence before answering.",
          commonConfusion: "A retrieval system can fail before generation begins.",
          sourceNote: "Lecture 2, limitations",
        },
      ],
    });

    expect(sheet.topics).toHaveLength(4);
    expect(sheet.topics[0].commonConfusion).toContain("rather than");
  });
});
