import { describe, expect, it } from "vitest";
import { buildExamReviewInstructions, ExamReviewSheetSchema } from "./exam-review";

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
          relatedMistakeIds: ["mistake-retrieval"],
          mistakeFocus: "Revisit why retrieval happens before generation.",
        },
        {
          topic: "Grounding",
          keyIdeas: ["Grounding ties claims to the supplied sources."],
          formulaOrProcedure: "",
          commonConfusion: "Grounding does not guarantee every source is correct.",
          sourceNote: "Lecture 1, evaluation",
          relatedMistakeIds: [],
          mistakeFocus: "",
        },
        {
          topic: "Evaluation",
          keyIdeas: ["Measure answer quality against supported facts."],
          formulaOrProcedure: "",
          commonConfusion: "Fluency alone is not evidence of correctness.",
          sourceNote: "Lecture 2, metrics",
          relatedMistakeIds: [],
          mistakeFocus: "",
        },
        {
          topic: "Failure modes",
          keyIdeas: ["Poor retrieval can still cause unsupported answers."],
          formulaOrProcedure: "Inspect retrieved evidence before answering.",
          commonConfusion: "A retrieval system can fail before generation begins.",
          sourceNote: "Lecture 2, limitations",
          relatedMistakeIds: [],
          mistakeFocus: "",
        },
      ],
    });

    expect(sheet.topics).toHaveLength(4);
    expect(sheet.topics[0].commonConfusion).toContain("rather than");
    expect(sheet.topics[0].relatedMistakeIds).toEqual(["mistake-retrieval"]);
    expect(sheet.topics[0].mistakeFocus).toContain("before generation");
  });

  it("requires source facts and supplied mistake ids to remain separate", () => {
    expect(buildExamReviewInstructions()).toContain("sole factual authority");
    expect(buildExamReviewInstructions()).toContain("supplied mistake identifiers");
  });
});
