import { describe, expect, it } from "vitest";
import { jsPDF } from "jspdf";
import {
  createQuizPdf,
  getMistakePdfBlocks,
  getMaterialReviewPdfBlocks,
  getExamReviewPdfBlocks,
  getPdfHeaderTitleLines,
  getProgressPdfBlocks,
  getQuizExportFileName,
  getQuizPdfBlocks,
  getReviewPdfBlocks,
} from "./pdf-export";
import type { MistakeBookEntry } from "./mistake-book";
import { EMPTY_SOURCE, type StudySession } from "./study-history";
import type { Quiz } from "./quiz";
import type { MaterialReviewSheet } from "./material-review-sheet";
import type { ExamReviewSheet } from "./exam-review";

const gravityQuestion: Quiz["questions"][number] = {
  id: "force-1",
  type: "multiple_choice",
  points: 3,
  prompt: "Which force pulls objects toward Earth?",
  options: [
    {
      id: "a",
      text: "Friction",
      explanation: "Friction opposes motion; it does not pull downward.",
    },
    { id: "b", text: "Gravity", explanation: "Gravity is the attraction between masses." },
    { id: "c", text: "Magnetism", explanation: "Magnetism only acts on magnetic materials." },
    { id: "d", text: "Tension", explanation: "Tension acts along a rope, not toward Earth." },
  ],
  correctOptionId: "b",
  explanation: "Gravity attracts objects with mass.",
  sourceNote: "Forces handout",
};

const sampleQuiz: Quiz = {
  title: "Forces and motion",
  summary: "A quick science review.",
  questions: [gravityQuestion],
};

const examQuiz: Quiz = {
  title: "Computer architecture review",
  summary: "A mock final.",
  examHeader: {
    courseTitle: "Computer Architecture",
    paperLabel: "Mock Final A",
    durationMinutes: 90,
    scope: "Chapters 1-4",
  },
  questions: [
    gravityQuestion,
    {
      id: "amat-1",
      type: "short_answer",
      points: 14,
      prompt: "Derive the average memory access time.",
      referenceAnswer: "AMAT = hit time + miss rate x miss penalty.",
      gradingCriteria: ["States the formula"],
      customLabel: null,
      explanation: "AMAT combines hit time with the cost of misses.",
      sourceNote: "Cache chapter",
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

  it("prints the quiz on A4 portrait, the way an exam paper is set", () => {
    const pdf = createQuizPdf(sampleQuiz, "student");

    expect(pdf.internal.pageSize.getWidth()).toBeCloseTo(210, 1);
    expect(pdf.internal.pageSize.getHeight()).toBeCloseTo(297, 1);
  });

  it("lays the student copy out as an exam paper with a marks table", () => {
    const content = getQuizPdfBlocks(examQuiz, "student").join("\n");

    expect(content).toContain("Computer Architecture Mock Final A");
    expect(content).toContain("Time: 90 minutes    Total: 17 marks    Scope: Chapters 1-4");
    expect(content).toContain("Part I — Multiple Choice (3 marks each, 3 marks total)");
    expect(content).toContain("Part II — Short Answer (14 marks each, 14 marks total)");
    expect(content).toContain("1. [Single] Which force pulls objects toward Earth?");
    expect(content).toContain("2. Derive the average memory access time.");
    expect(content).toContain("Answer:");
  });

  it("numbers questions by section rather than by generation order", () => {
    const shuffled: Quiz = {
      ...examQuiz,
      questions: [examQuiz.questions[1], examQuiz.questions[0]],
    };

    const content = getQuizPdfBlocks(shuffled, "student").join("\n");

    expect(content).toContain("1. [Single] Which force pulls objects toward Earth?");
    expect(content).toContain("2. Derive the average memory access time.");
  });

  it("builds student-copy blocks without the answers or explanations", () => {
    const content = getQuizPdfBlocks(sampleQuiz, "student").join("\n");

    expect(content).toContain("Which force pulls objects toward Earth?");
    expect(content).not.toContain("Answer Key");
    expect(content).not.toContain("Gravity attracts objects with mass.");
    expect(content).not.toContain("Correct answer: Gravity");
    expect(content).not.toContain("Friction opposes motion; it does not pull downward.");
  });

  it("builds answer-key blocks with the answers and explanations", () => {
    const content = getQuizPdfBlocks(sampleQuiz, "answer_key").join("\n");

    expect(content).toContain("Answer Key");
    expect(content).toContain("Correct answer: Gravity");
    expect(content).toContain("Gravity attracts objects with mass.");
  });

  it("prints an explanation for every option in the answer key", () => {
    const content = getQuizPdfBlocks(sampleQuiz, "answer_key").join("\n");

    expect(content).toContain("Option analysis");
    expect(content).toContain("A. Friction opposes motion; it does not pull downward.");
    expect(content).toContain("B. Gravity is the attraction between masses.");
    expect(content).toContain("C. Magnetism only acts on magnetic materials.");
    expect(content).toContain("D. Tension acts along a rope, not toward Earth.");
  });

  it("omits option analysis for quizzes saved before it existed", () => {
    const legacy: Quiz = {
      ...sampleQuiz,
      questions: [
        {
          ...gravityQuestion,
          options:
            gravityQuestion.type === "multiple_choice"
              ? gravityQuestion.options.map(({ id, text }) => ({ id, text }))
              : [],
        } as Quiz["questions"][number],
      ],
    };

    expect(getQuizPdfBlocks(legacy, "answer_key").join("\n")).not.toContain("Option analysis");
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
    expect(getQuizPdfBlocks(customQuiz, "student").join("\n")).toContain(longOption);
    expect(getQuizPdfBlocks(customQuiz, "student").join("\n")).toContain("Explain your evidence.");
  });

  it("renders unbroken title and option tokens as width-safe text chunks", () => {
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
      for (let start = 0; start < chunks.length; start += 1) {
        let joined = "";
        for (let end = start; end < chunks.length; end += 1) {
          joined += chunks[end];
          if (joined === token) return chunks.slice(start, end + 1);
          if (!token.startsWith(joined)) break;
        }
      }
      return undefined;
    };
    const titleChunks = chunksFor("TITLE", titleToken);
    // The exam layout prints the letter and the option text as one line.
    const optionChunks = chunksFor("OPTION", `A. ${optionToken}`);

    expect(titleChunks).toBeDefined();
    expect(optionChunks).toBeDefined();
    // A4 portrait with 18mm margins, minus the option indent.
    const measure = new jsPDF();
    measure.setFont("helvetica", "bold");
    measure.setFontSize(15);
    expect(
      Math.max(...titleChunks!.map((chunk) => measure.getTextWidth(chunk))),
    ).toBeLessThanOrEqual(174);
    measure.setFont("helvetica", "normal");
    measure.setFontSize(10);
    expect(
      Math.max(...optionChunks!.map((chunk) => measure.getTextWidth(chunk))),
    ).toBeLessThanOrEqual(167);
  });
});
