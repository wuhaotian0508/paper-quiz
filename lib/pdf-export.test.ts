import { describe, expect, it } from "vitest";
import { jsPDF } from "jspdf";
import {
  createQuizPdf,
  getMistakePdfBlocks,
  getMaterialReviewPdfBlocks,
  getExamReviewPdfBlocks,
  getPdfHeaderTitleLines,
  getProgressPdfBlocks,
  getQuestionTypeBadgeLines,
  getQuizExportFileName,
  getQuizPdfBlocks,
  getReviewPdfBlocks,
} from "./pdf-export";
import type { MistakeBookEntry } from "./mistake-book";
import { EMPTY_SOURCE, type StudySession } from "./study-history";
import type { Quiz } from "./quiz";
import type { MaterialReviewSheet } from "./material-review-sheet";
import type { ExamReviewSheet } from "./exam-review";

const sampleQuiz: Quiz = {
  title: "Forces and motion",
  summary: "A quick science review.",
  questions: [
    {
      id: "force-1",
      type: "multiple_choice",
      prompt: "Which force pulls objects toward Earth?",
      options: [
        { id: "a", text: "Friction" },
        { id: "b", text: "Gravity" },
        { id: "c", text: "Magnetism" },
        { id: "d", text: "Tension" },
      ],
      correctOptionId: "b",
      explanation: "Gravity attracts objects with mass.",
      sourceNote: "Forces handout",
    },
  ],
};

describe("quiz PDF export contract", () => {
  it("uses the student-copy file name for student exports", () => {
    expect(getQuizExportFileName("student")).toBe("paper-quiz-student-copy.pdf");
  });

  it("uses the answer-key file name for answer-key exports", () => {
    expect(getQuizExportFileName("answer_key")).toBe("paper-quiz-answer-key.pdf");
  });

  it("builds student-copy blocks without the answers or explanations", () => {
    const content = getQuizPdfBlocks(sampleQuiz, "student").join("\n");

    expect(content).toContain("PAPER QUIZ AI / STUDENT COPY");
    expect(content).toContain("Which force pulls objects toward Earth?");
    expect(content).not.toContain("ANSWER + EXPLANATION");
    expect(content).not.toContain("Gravity attracts objects with mass.");
    expect(content).not.toContain("Correct answer: Gravity");
  });

  it("builds answer-key blocks with the answers and explanations", () => {
    const content = getQuizPdfBlocks(sampleQuiz, "answer_key").join("\n");

    expect(content).toContain("PAPER QUIZ AI / ANSWER KEY");
    expect(content).toContain("ANSWER + EXPLANATION");
    expect(content).toContain("Correct answer: Gravity");
    expect(content).toContain("Gravity attracts objects with mass.");
  });

  it("gives saved mistake and review exports the Paper Quiz template headers", () => {
    const incorrect = {
      status: "incorrect" as const,
      score: 0,
      feedback: "Review gravity.",
      missingPoints: [],
    };
    const mistakes: MistakeBookEntry[] = [
      {
        version: 1,
        id: "m1",
        question: sampleQuiz.questions[0],
        answer: "a",
        ...incorrect,
        updatedAt: "2026-07-24T00:00:00.000Z",
        source: EMPTY_SOURCE,
      },
    ];
    const session: StudySession = {
      id: "s1",
      title: sampleQuiz.title,
      createdAt: "2026-07-24T00:00:00.000Z",
      questions: sampleQuiz.questions,
      answers: { "force-1": "a" },
      grades: { "force-1": incorrect },
      chat: {},
      source: EMPTY_SOURCE,
    };

    expect(getMistakePdfBlocks(mistakes)[0]).toBe("PAPER QUIZ AI / MISTAKE BOOK");
    expect(getReviewPdfBlocks(session)[0]).toBe("PAPER QUIZ AI / GRADED REVIEW");
  });

  it("exports a material review sheet with its snapshot, weaknesses, and coverage", () => {
    const sheet: MaterialReviewSheet = {
      materialId: "strategy::1000",
      title: "Strategy.pdf Review Sheet",
      questionCount: 4,
      mistakeCount: 1,
      sessionCount: 2,
      weaknesses: [
        {
          id: "m1",
          prompt: "What creates a durable advantage?",
          keyAnswer: "Switching costs",
          remember: "They retain customers.",
          sourceNote: "Page 24 - Seven Powers",
        },
      ],
      coverage: [{ sourceNote: "Page 24 - Seven Powers", questionCount: 4 }],
    };

    const content = getMaterialReviewPdfBlocks(sheet).join("\n");

    expect(content).toContain("PAPER QUIZ AI / MATERIAL REVIEW SHEET");
    expect(content).toContain("Strategy.pdf Review Sheet");
    expect(content).toContain("Saved questions: 4");
    expect(content).toContain("What creates a durable advantage?");
    expect(content).toContain("Coverage: Page 24 - Seven Powers (4 questions)");
  });

  it("exports an exam review with ideas, common confusions, and source notes", () => {
    const sheet: ExamReviewSheet = {
      title: "RAG Exam Review",
      topics: [
        {
          topic: "Retrieval",
          keyIdeas: ["Retrieve context before generation."],
          formulaOrProcedure: "Retrieve, rank, generate.",
          commonConfusion: "Retrieval supplements the model; it does not retrain it.",
          sourceNote: "Lecture 1, pipeline",
          relatedMistakeIds: ["mistake-1"],
          mistakeFocus: "Review the retrieval sequence.",
        },
      ],
    };

    const content = getExamReviewPdfBlocks(sheet).join("\n");

    expect(content).toContain("PAPER QUIZ AI / EXAM REVIEW");
    expect(content).toContain("Key ideas: Retrieve context before generation.");
    expect(content).toContain("Common confusion: Retrieval supplements the model");
    expect(content).toContain("Your focus: Review the retrieval sequence.");
    expect(content).toContain("Source: Lecture 1, pipeline");
  });

  it("gives the progress report a Paper Quiz template header and session cards", () => {
    const session: StudySession = {
      id: "s2",
      title: "Forces practice",
      createdAt: "2026-07-24T00:00:00.000Z",
      questions: [],
      answers: {},
      grades: { q1: { status: "correct", score: 1, feedback: "Good", missingPoints: [] } },
      chat: {},
      source: EMPTY_SOURCE,
    };
    const blocks = getProgressPdfBlocks([session]);

    expect(blocks[0]).toBe("PAPER QUIZ AI / PROGRESS REPORT");
    expect(blocks.join("\n")).toContain("Completed practice sets: 1");
    expect(blocks.join("\n")).toContain("Forces practice");
    expect(blocks.join("\n")).toContain("100% accuracy");
  });

  it("keeps long titles, custom labels, and option text available to the renderer", () => {
    const longTitle =
      "An extra long science practice title that must wrap neatly inside the Paper Quiz header";
    const longCustomLabel = "Evidence based scientific explanation with complete reasoning";
    const longOption =
      "A detailed option that is intentionally longer than two lines so no answer text can disappear from the exported paper.";
    const customQuiz: Quiz = {
      ...sampleQuiz,
      title: longTitle,
      questions: [
        {
          id: "long-option-1",
          type: "multiple_choice",
          prompt: "Which option is longest?",
          options: [
            { id: "a", text: longOption },
            { id: "b", text: "A shorter option" },
            { id: "c", text: "Another short option" },
            { id: "d", text: "Last short option" },
          ],
          correctOptionId: "a",
          explanation: "The long option is included in full.",
          sourceNote: "Test source",
        },
        {
          id: "custom-1",
          type: "custom",
          customLabel: longCustomLabel,
          prompt: "Explain your evidence.",
          referenceAnswer: "Use evidence and reasoning.",
          gradingCriteria: ["Evidence"],
          explanation: "Connect the evidence to the claim.",
          sourceNote: "Lab notes",
        },
      ],
    };

    expect(getPdfHeaderTitleLines(longTitle).join(" ")).toBe(longTitle);
    expect(getQuestionTypeBadgeLines(customQuiz.questions[1]).join(" ")).toBe(
      longCustomLabel.toUpperCase(),
    );
    expect(getQuizPdfBlocks(customQuiz, "student").join("\n")).toContain(longOption);
  });

  it("renders unbroken title, badge, and option tokens as width-safe text chunks", () => {
    const titleToken = "TITLE".repeat(70);
    const labelToken = "LABEL".repeat(55);
    const optionToken = "OPTION".repeat(60);
    const quiz: Quiz = {
      title: titleToken,
      summary: "Token rendering check.",
      questions: [
        {
          id: "token-option",
          type: "multiple_choice",
          prompt: "Choose the matching token.",
          options: [
            { id: "a", text: optionToken },
            { id: "b", text: "B" },
            { id: "c", text: "C" },
            { id: "d", text: "D" },
          ],
          correctOptionId: "a",
          explanation: "A is the token.",
          sourceNote: "Token source",
        },
        {
          id: "token-custom",
          type: "custom",
          customLabel: labelToken,
          prompt: "Use the token.",
          referenceAnswer: "Token.",
          gradingCriteria: ["Token"],
          explanation: "Use it exactly.",
          sourceNote: "Token source",
        },
      ],
    };
    let pdf: ReturnType<typeof createQuizPdf> | undefined;
    expect(() => {
      pdf = createQuizPdf(quiz, "student");
    }).not.toThrow();

    const pageCommands = Object.values(pdf!.internal.pages).flat().join("\n");
    const textChunks = Array.from(pageCommands.matchAll(/\(([^()]*)\) Tj/g), (match) => match[1]);
    const chunksFor = (marker: string, token: string) => {
      const chunks = textChunks.filter((chunk) => chunk.includes(marker));
      return chunks.join("") === token ? chunks : undefined;
    };
    const titleChunks = chunksFor("TITLE", titleToken);
    const labelChunks = chunksFor("LABEL", labelToken);
    const optionChunks = chunksFor("OPTION", optionToken);

    expect(titleChunks).toBeDefined();
    expect(labelChunks).toBeDefined();
    expect(optionChunks).toBeDefined();
    const measure = new jsPDF();
    measure.setFont("helvetica", "bold");
    measure.setFontSize(12);
    expect(
      Math.max(...titleChunks!.map((chunk) => measure.getTextWidth(chunk))),
    ).toBeLessThanOrEqual(186);
    measure.setFontSize(7.5);
    expect(
      Math.max(...labelChunks!.map((chunk) => measure.getTextWidth(chunk))),
    ).toBeLessThanOrEqual(46);
    measure.setFont("helvetica", "normal");
    measure.setFontSize(8);
    expect(
      Math.max(...optionChunks!.map((chunk) => measure.getTextWidth(chunk))),
    ).toBeLessThanOrEqual(77);
  });
});
