import { describe, expect, it } from "vitest";
import {
  buildExamReviewInstructions,
  ExamReviewSheetSchema,
  orderedReviewSections,
  reviewSectionsFor,
  REVIEW_FULL_WIDTH,
  REVIEW_LEFT_COLUMN,
  REVIEW_RIGHT_COLUMN,
} from "./exam-review";
import { parseExamReviewOutput } from "./exam-review-output";
import { getExamReviewPdfBlocks } from "./pdf-export";

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
    expect(sheet.topics?.[0].commonConfusion).toContain("rather than");
    expect(sheet.topics?.[0].relatedMistakeIds).toEqual(["mistake-retrieval"]);
    expect(sheet.topics?.[0].mistakeFocus).toContain("before generation");
  });

  it("keeps the source material as the only factual authority", () => {
    expect(buildExamReviewInstructions()).toContain("sole factual authority");
    expect(buildExamReviewInstructions()).toContain("two-column revision sheet");
    expect(buildExamReviewInstructions()).toContain("keyConcepts");
    expect(buildExamReviewInstructions()).toContain("nextSteps");
  });

  it("accepts a JSON response wrapped in a Markdown code fence", () => {
    const topics = Array.from({ length: 4 }, (_, index) => ({
      topic: `Topic ${index + 1}`,
      keyIdeas: ["Source-grounded idea."],
      formulaOrProcedure: "",
      commonConfusion: "A common confusion.",
      sourceNote: "Transcript section.",
      relatedMistakeIds: [],
      mistakeFocus: "",
    }));

    expect(
      parseExamReviewOutput(`\`\`\`json\n${JSON.stringify({ title: "Review", topics })}\n\`\`\``),
    ).toMatchObject({ title: "Review", topics });
  });
});

describe("two-column review sections", () => {
  const section = (kind: string, heading: string) => ({
    kind,
    heading,
    items: [{ label: "", body: `Something about ${heading}.` }],
  });

  const sheet = {
    title: "Newton's Laws Review Sheet",
    subject: "Physics",
    scope: "2.4 - 2.7",
    goal: "Apply to problems",
    sourceNote: "Chapter 2",
    topics: null,
    sections: [
      section("nextSteps", "Plan"),
      section("formulas", "Formulas"),
      section("keyConcepts", "Key concepts"),
      section("questions", "Questions I have"),
      section("importantDetails", "Important details"),
    ],
  };

  it("numbers sections in printed order regardless of the order returned", () => {
    const parsed = ExamReviewSheetSchema.parse(sheet);

    expect(
      orderedReviewSections(parsed).map((entry) => [entry.number, entry.section.kind]),
    ).toEqual([
      [1, "keyConcepts"],
      [2, "importantDetails"],
      [3, "questions"],
      [4, "formulas"],
      [5, "nextSteps"],
    ]);
  });

  it("splits sections across the left column, right column, and full-width strip", () => {
    const parsed = ExamReviewSheetSchema.parse(sheet);

    expect(reviewSectionsFor(parsed, REVIEW_LEFT_COLUMN).map((e) => e.section.kind)).toEqual([
      "keyConcepts",
      "importantDetails",
    ]);
    expect(reviewSectionsFor(parsed, REVIEW_RIGHT_COLUMN).map((e) => e.section.kind)).toEqual([
      "questions",
      "formulas",
    ]);
    expect(reviewSectionsFor(parsed, REVIEW_FULL_WIDTH).map((e) => e.section.kind)).toEqual([
      "nextSteps",
    ]);
  });

  it("keeps legacy topic sheets loadable and free of sections", () => {
    const legacy = ExamReviewSheetSchema.parse({
      title: "Old sheet",
      topics: [
        {
          topic: "Retrieval",
          keyIdeas: ["An idea."],
          formulaOrProcedure: "",
          commonConfusion: "A confusion.",
          sourceNote: "Lecture 1",
          relatedMistakeIds: [],
          mistakeFocus: "",
        },
      ],
    });

    expect(orderedReviewSections(legacy)).toEqual([]);
    expect(legacy.topics).toHaveLength(1);
  });

  it("exports the numbered sections rather than the legacy topic fields", () => {
    const blocks = getExamReviewPdfBlocks(ExamReviewSheetSchema.parse(sheet)).join("\n");

    expect(blocks).toContain("1. Key concepts");
    expect(blocks).toContain("5. Plan");
    expect(blocks).not.toContain("Common confusion:");
  });

  it("normalizes a gateway response that nests sections and plain-string items", () => {
    const parsed = parseExamReviewOutput(
      JSON.stringify({
        exam_review: {
          title: "Review",
          sections: [
            { kind: "keyConcepts", title: "核心概念", points: ["第一条", { text: "第二条" }] },
            { kind: "importantDetails", heading: "重要细节", items: ["细节"] },
            { kind: "mistakes", heading: "常见错误", items: ["错误"] },
            { kind: "nextSteps", heading: "下一步", items: ["复习错题"] },
          ],
        },
      }),
    );

    expect(parsed.sections?.[0].heading).toBe("核心概念");
    expect(parsed.sections?.[0].items).toEqual([
      { label: "", body: "第一条" },
      { label: "", body: "第二条" },
    ]);
    expect(parsed.topics).toBeNull();
  });
});
