import { jsPDF } from "jspdf";
import type { MistakeBookEntry } from "@/lib/mistake-book";
import type { GradeResult, Question, Quiz } from "@/lib/quiz";
import { getSessionAccuracy, type StudySession } from "@/lib/study-history";
import type { MaterialReviewSheet } from "@/lib/material-review-sheet";
import type { WeaknessReviewSheet } from "@/lib/review-sheet";
import {
  orderedReviewSections,
  REVIEW_FULL_WIDTH,
  REVIEW_LEFT_COLUMN,
  REVIEW_RIGHT_COLUMN,
  type ExamReviewSection,
  type ExamReviewSheet,
} from "@/lib/exam-review";
import { buildExamPaper, type ExamPaperQuestion, type ExamPaperSection } from "@/lib/exam-paper";
import { DEFAULT_LOCALE, translate, type Locale } from "@/lib/i18n";
import {
  containsCjk,
  loadPdfFontData,
  registerPdfFont,
  PDF_CJK_FONT,
  type PdfFontData,
} from "@/lib/pdf-font";

export type QuizExportMode = "student" | "answer_key";

export type QuizPdfOptions = {
  locale?: Locale;
  /** Chinese face to embed. Omit for Latin-only content; jsPDF cannot render CJK without it. */
  fontData?: PdfFontData | null;
};

export function getQuizExportFileName(mode: QuizExportMode) {
  return mode === "student" ? "paper-quiz-student-copy.pdf" : "paper-quiz-answer-key.pdf";
}

// Saved-learning exports (mistake book, progress, review) stay on the spacious
// lecture-note 16:9 canvas. The exam paper and revision sheet use A4 instead.
const PAGE_WIDTH = 297;
const PAGE_HEIGHT = 167.1;
const SIDE_MARGIN = 15;
const CONTENT_WIDTH = PAGE_WIDTH - SIDE_MARGIN * 2;
const CONTENT_BOTTOM = PAGE_HEIGHT - 16;
const PALETTE = {
  teal: "#075D63",
  darkTeal: "#03484F",
  mint: "#28A88A",
  paleMint: "#E7F3EF",
  paleBlue: "#EEF4F5",
  coral: "#D96F55",
  gold: "#E5AE4A",
  ink: "#121817",
  muted: "#647473",
  line: "#C9E1DB",
  paper: "#FFFFFF",
};

function splitWordsForPdf(text: string, maxCharacters: number): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const result: string[] = [];
  let line = "";
  words.forEach((word) => {
    if (!line) {
      line = word;
    } else if (`${line} ${word}`.length <= maxCharacters) {
      line = `${line} ${word}`;
    } else {
      result.push(line);
      line = word;
    }
  });
  if (line) result.push(line);
  return result.length ? result : [""];
}

// jsPDF's word wrapper cannot split every unbroken token, so finish wrapping by
// measured glyph width before any text reaches a constrained PDF region.
function splitPdfTextToWidth(pdf: jsPDF, text: string, maxWidth: number): string[] {
  const wrapped = pdf.splitTextToSize(text, maxWidth) as string[];
  const lines: string[] = [];

  wrapped.forEach((line) => {
    if (pdf.getTextWidth(line) <= maxWidth) {
      lines.push(line);
      return;
    }

    let chunk = "";
    for (const character of line) {
      const candidate = `${chunk}${character}`;
      if (chunk && pdf.getTextWidth(candidate) > maxWidth) {
        lines.push(chunk);
        chunk = character;
      } else {
        chunk = candidate;
      }
    }
    if (chunk) lines.push(chunk);
  });

  return lines.length ? lines : [""];
}

export function getPdfHeaderTitleLines(title: string): string[] {
  return splitWordsForPdf(title, 58);
}

function questionAnswer(question: Question) {
  return question.type === "multiple_choice"
    ? question.options.find((option) => option.id === question.correctOptionId)?.text || ""
    : question.referenceAnswer;
}

/** Chinese exam papers label with a fullwidth colon and no trailing space. */
function labelled(locale: Locale, label: string, value: string) {
  return locale === "zh" ? `${label}：${value}` : `${label}: ${value}`;
}

function optionLine(locale: Locale, letter: string, text: string) {
  return locale === "zh" ? `${letter}：${text}` : `${letter}. ${text}`;
}

type AnswerKeyLine = { text: string; emphasis?: boolean; indent?: boolean };

/** The answer key for one question, shared by the PDF and its plain-text contract. */
function answerKeyLines(question: Question, locale: Locale): AnswerKeyLine[] {
  const lines: AnswerKeyLine[] = [
    {
      text: labelled(locale, translate(locale, "exam.correctAnswer"), questionAnswer(question)),
      emphasis: true,
    },
  ];
  if (question.type === "multiple_choice") {
    const analysed = question.options.filter((option) => option.explanation);
    if (analysed.length) {
      lines.push({ text: translate(locale, "exam.optionAnalysis"), emphasis: true });
      analysed.forEach((option) =>
        lines.push({
          text: optionLine(locale, option.id.toUpperCase(), option.explanation ?? ""),
          indent: true,
        }),
      );
    }
  }
  lines.push(
    { text: labelled(locale, translate(locale, "exam.explanation"), question.explanation) },
    { text: labelled(locale, translate(locale, "exam.source"), question.sourceNote) },
  );
  return lines;
}

/** Plain-text mirror of the exported paper, used to assert export content in tests. */
export function getQuizPdfBlocks(
  quiz: Quiz,
  mode: QuizExportMode,
  locale: Locale = DEFAULT_LOCALE,
): string[] {
  const paper = buildExamPaper(quiz, locale);
  const blocks = [paper.courseTitle, paper.metaLine];
  if (mode === "answer_key") blocks.push(translate(locale, "exam.answerKeyLabel"));

  paper.sections.forEach((section) => {
    blocks.push(section.heading);
    section.questions.forEach((item) => {
      const lines = [examQuestionPrompt(item, section, locale)];
      if (item.question.type === "multiple_choice")
        item.question.options.forEach((option) =>
          lines.push(optionLine(locale, option.id.toUpperCase(), option.text)),
        );
      if (mode === "answer_key")
        lines.push(...answerKeyLines(item.question, locale).map((line) => line.text));
      else if (section.kind === "written") lines.push(translate(locale, "exam.answerLabel"));
      blocks.push(lines.join("\n"));
    });
  });

  return blocks;
}

function examQuestionPrompt(
  item: ExamPaperQuestion,
  section: ExamPaperSection,
  locale: Locale,
): string {
  // Chinese brackets already separate the tag from the stem; Latin text needs a space.
  const tag =
    item.question.type === "multiple_choice"
      ? `${translate(locale, "exam.singleChoiceTag")}${locale === "zh" ? "" : " "}`
      : "";
  const marks = section.showsPerQuestionPoints
    ? translate(locale, "exam.questionPoints", { points: item.points })
    : "";
  return `${item.number}. ${tag}${item.question.prompt}${marks}`;
}

// The exported paper mirrors a printed university mock exam: A4 portrait, a centred
// course banner, an identity line, a marks table, then numbered sections.
const EXAM_LEFT = 18;
const EXAM_WIDTH = 210 - EXAM_LEFT * 2;
const EXAM_CENTRE = 105;
const EXAM_TOP = 20;
const EXAM_BOTTOM = 278;

export function createQuizPdf(
  quiz: Quiz,
  mode: QuizExportMode,
  options: QuizPdfOptions = {},
): jsPDF {
  const locale = options.locale ?? DEFAULT_LOCALE;
  const pdf = new jsPDF({ format: "a4", unit: "mm" });
  const family = registerPdfFont(pdf, options.fontData ?? null) ? PDF_CJK_FONT : "helvetica";
  const paper = buildExamPaper(quiz, locale);
  let y = EXAM_TOP;

  const face = (style: "normal" | "bold", size: number, color: string = PALETTE.ink) => {
    pdf.setFont(family, style);
    pdf.setFontSize(size);
    pdf.setTextColor(color);
  };

  const ensureSpace = (height: number) => {
    if (y + height > EXAM_BOTTOM) {
      pdf.addPage();
      y = EXAM_TOP;
    }
  };

  /** Flows wrapped text down the page, starting a new page when the column runs out. */
  const flow = (value: string, x: number, width: number, lineHeight: number) => {
    splitPdfTextToWidth(pdf, value, width).forEach((line) => {
      ensureSpace(lineHeight);
      pdf.text(line, x, y);
      y += lineHeight;
    });
  };

  const centred = (value: string, lineHeight: number) => {
    splitPdfTextToWidth(pdf, value, EXAM_WIDTH).forEach((line) => {
      ensureSpace(lineHeight);
      pdf.text(line, EXAM_CENTRE, y, { align: "center" });
      y += lineHeight;
    });
  };

  const drawIdentityLine = () => {
    face("normal", 10);
    const slot = EXAM_WIDTH / paper.identityFields.length;
    ensureSpace(10);
    paper.identityFields.forEach((label, index) => {
      const x = EXAM_LEFT + index * slot;
      const prefix = labelled(locale, label, "");
      pdf.text(prefix, x, y);
      pdf.setDrawColor(PALETTE.ink);
      pdf.setLineWidth(0.3);
      pdf.line(x + pdf.getTextWidth(prefix), y + 1, x + slot - 5, y + 1);
    });
    y += 10;
  };

  const drawScoreTable = () => {
    const columns = paper.scoreTable.columns;
    const labelWidth = 22;
    const cellWidth = (EXAM_WIDTH - labelWidth) / (columns.length - 1);
    const rowHeight = 8.5;
    ensureSpace(rowHeight * 2 + 6);
    const top = y;
    pdf.setDrawColor(PALETTE.ink);
    pdf.setLineWidth(0.3);
    face("normal", 10);
    for (let row = 0; row < 2; row += 1) {
      let x = EXAM_LEFT;
      columns.forEach((column, index) => {
        const width = index === 0 ? labelWidth : cellWidth;
        pdf.rect(x, top + row * rowHeight, width, rowHeight);
        // Row 1 is the blank grid the marker fills in, so only its label is printed.
        if (row === 0 || index === 0) {
          const value = row === 0 ? column : paper.scoreTable.rowLabel;
          pdf.text(value, x + width / 2, top + row * rowHeight + rowHeight / 2 + 1.5, {
            align: "center",
          });
        }
        x += width;
      });
    }
    y = top + rowHeight * 2 + 8;
  };

  /** Blank working space under a written question, sized by how much it is worth. */
  const drawAnswerSpace = (points: number) => {
    const height = Math.min(85, Math.max(28, points * 4.5));
    ensureSpace(height);
    y += height;
  };

  const drawAnswerKey = (question: Question) => {
    y += 1.5;
    answerKeyLines(question, locale).forEach((line) => {
      face(line.emphasis ? "bold" : "normal", 9, line.emphasis ? PALETTE.teal : PALETTE.ink);
      const x = EXAM_LEFT + (line.indent ? 11 : 5);
      splitPdfTextToWidth(pdf, line.text, EXAM_WIDTH - (line.indent ? 14 : 8)).forEach((part) => {
        ensureSpace(4.6);
        // A per-line rule rather than one panel, so a long key can span pages.
        pdf.setFillColor(PALETTE.mint);
        pdf.rect(EXAM_LEFT, y - 3.2, 1.4, 4.6, "F");
        pdf.text(part, x, y);
        y += 4.6;
      });
    });
  };

  face("bold", 15);
  centred(paper.courseTitle, 7.5);
  y += 1.5;
  face("normal", 9.5, PALETTE.muted);
  centred(paper.metaLine, 5.2);
  y += 4;

  if (mode === "answer_key") {
    face("bold", 11, PALETTE.coral);
    centred(translate(locale, "exam.answerKeyLabel"), 6);
    y += 4;
  } else {
    drawIdentityLine();
    drawScoreTable();
  }

  paper.sections.forEach((section, sectionIndex) => {
    if (sectionIndex > 0) y += 4;
    ensureSpace(16);
    face("bold", 11.5, PALETTE.darkTeal);
    flow(section.heading, EXAM_LEFT, EXAM_WIDTH, 6);
    y += 2.5;

    section.questions.forEach((item) => {
      ensureSpace(14);
      face("normal", 10);
      flow(examQuestionPrompt(item, section, locale), EXAM_LEFT, EXAM_WIDTH, 5.6);

      if (item.question.type === "multiple_choice") {
        face("normal", 10);
        item.question.options.forEach((option) =>
          flow(
            optionLine(locale, option.id.toUpperCase(), option.text),
            EXAM_LEFT + 7,
            EXAM_WIDTH - 7,
            5.4,
          ),
        );
      }

      if (mode === "answer_key") {
        drawAnswerKey(item.question);
      } else if (section.kind === "written") {
        ensureSpace(8);
        face("normal", 10);
        pdf.text(translate(locale, "exam.answerLabel"), EXAM_LEFT, y + 4);
        y += 6;
        drawAnswerSpace(item.points);
      }
      y += 4;
    });
  });

  const pageCount = pdf.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    pdf.setPage(page);
    face("normal", 8, PALETTE.muted);
    pdf.text(`${page} / ${pageCount}`, EXAM_CENTRE, 288, { align: "center" });
  }

  return pdf;
}

function correctAnswer(question: Question) {
  return question.type === "multiple_choice"
    ? question.options.find((option) => option.id === question.correctOptionId)?.text || ""
    : question.referenceAnswer;
}
/** All the quiz text that has to be printable, used to decide whether to fetch the CJK face. */
function quizText(quiz: Quiz): string {
  return [
    quiz.title,
    quiz.summary,
    ...quiz.questions.flatMap((question) => [
      question.prompt,
      question.explanation,
      question.sourceNote,
      ...(question.type === "multiple_choice"
        ? question.options.flatMap((option) => [option.text, option.explanation ?? ""])
        : [question.referenceAnswer]),
    ]),
  ].join(" ");
}

export async function downloadQuizPdf(
  quiz: Quiz,
  mode: QuizExportMode,
  locale: Locale = DEFAULT_LOCALE,
) {
  const needsCjk = locale === "zh" || containsCjk(quizText(quiz));
  const fontData = needsCjk ? await loadPdfFontData() : null;
  createQuizPdf(quiz, mode, { locale, fontData }).save(getQuizExportFileName(mode));
}
export function getMistakePdfBlocks(entries: MistakeBookEntry[]): string[] {
  return [
    "PAPER QUIZ AI / MISTAKE BOOK",
    ...entries.map(
      (entry, index) =>
        `${index + 1}. ${entry.question.prompt}\nYour answer: ${entry.answer || "Skipped"}\nCorrect answer: ${correctAnswer(entry.question)}\nFeedback: ${entry.feedback}\nSource: ${entry.question.sourceNote}`,
    ),
  ];
}

export function getReviewPdfBlocks(session: StudySession): string[] {
  return [
    "PAPER QUIZ AI / GRADED REVIEW",
    ...session.questions.map((question, index) => {
      const grade = session.grades[question.id];
      return `${index + 1}. ${question.prompt}\nYour answer: ${session.answers[question.id] || "Skipped"}\nCorrect answer: ${correctAnswer(question)}\nGrade: ${grade ? `${grade.status} (${Math.round(grade.score * 100)}%)` : "Not graded"}\nFeedback: ${grade?.feedback || question.explanation}\nSource: ${question.sourceNote}`;
    }),
  ];
}

export function createSavedLearningPdf(blocks: string[], fontData?: PdfFontData | null): jsPDF {
  const pdf = new jsPDF({
    orientation: "landscape",
    format: [PAGE_WIDTH, PAGE_HEIGHT],
    unit: "mm",
  });
  const family = registerPdfFont(pdf, fontData ?? null) ? PDF_CJK_FONT : "helvetica";
  const [heading, ...entries] = blocks;
  let page = 0;
  let y = 0;
  const drawBrandMark = () => {
    const markX = PAGE_WIDTH - SIDE_MARGIN - 40;
    pdf.setFillColor(PALETTE.teal);
    pdf.rect(markX, 4, 4, 8, "F");
    pdf.setFillColor(PALETTE.mint);
    pdf.rect(markX + 5.5, 4, 4, 5, "F");
    pdf.rect(markX + 5.5, 10, 4, 2, "F");
    pdf.setTextColor(PALETTE.teal);
    pdf.setFont(family, "bold");
    pdf.setFontSize(7.5);
    pdf.text("PAPER QUIZ AI", markX + 13, 9.5);
  };
  const drawPage = () => {
    page += 1;
    pdf.setFillColor(PALETTE.paper);
    pdf.rect(0, 0, PAGE_WIDTH, PAGE_HEIGHT, "F");
    pdf.setFillColor(PALETTE.darkTeal);
    pdf.rect(0, 0, 7, 25, "F");
    pdf.setFillColor(PALETTE.mint);
    pdf.rect(7, 0, 2, 25, "F");
    pdf.setTextColor(PALETTE.teal);
    pdf.setFont(family, "bold");
    pdf.setFontSize(12);
    pdf.text(splitPdfTextToWidth(pdf, heading, 186), SIDE_MARGIN, 14, { lineHeightFactor: 1.05 });
    drawBrandMark();
    const footerY = PAGE_HEIGHT - 9.5;
    pdf.setDrawColor(PALETTE.line);
    pdf.setLineWidth(0.35);
    pdf.line(0, footerY, SIDE_MARGIN + 58, footerY);
    pdf.line(PAGE_WIDTH - SIDE_MARGIN - 58, footerY, PAGE_WIDTH, footerY);
    pdf.setTextColor(PALETTE.teal);
    pdf.setFont(family, "bold");
    pdf.setFontSize(6.5);
    pdf.text("LEARN   /   PRACTICE   /   MASTER", SIDE_MARGIN + 64, footerY + 2.2);
    pdf.setTextColor(PALETTE.muted);
    pdf.setFont(family, "normal");
    pdf.setFontSize(7);
    pdf.text("Paper Quiz AI", SIDE_MARGIN, PAGE_HEIGHT - 3.2);
    pdf.text(`Page ${page}`, PAGE_WIDTH - SIDE_MARGIN, PAGE_HEIGHT - 3.2, { align: "right" });
    y = 31;
  };
  drawPage();

  entries.forEach((entry) => {
    pdf.setFont(family, "normal");
    pdf.setFontSize(8);
    const blockLines = entry
      .split("\n")
      .flatMap((line) => splitPdfTextToWidth(pdf, line, CONTENT_WIDTH - 10));
    const blockHeight = Math.max(14, blockLines.length * 4 + 8);
    if (y + blockHeight > CONTENT_BOTTOM) {
      pdf.addPage();
      drawPage();
    }
    pdf.setFillColor(PALETTE.paleMint);
    pdf.rect(SIDE_MARGIN, y, CONTENT_WIDTH, blockHeight, "F");
    pdf.setFillColor(PALETTE.teal);
    pdf.rect(SIDE_MARGIN, y, 2.5, blockHeight, "F");
    pdf.setTextColor(PALETTE.ink);
    pdf.setFont(family, "normal");
    pdf.setFontSize(8);
    blockLines.forEach((line, lineIndex) => {
      pdf.setFont(family, lineIndex === 0 ? "bold" : "normal");
      pdf.setTextColor(lineIndex === 0 ? PALETTE.teal : PALETTE.ink);
      pdf.text(line, SIDE_MARGIN + 7, y + 5 + lineIndex * 4);
    });
    y += blockHeight + 4;
  });
  return pdf;
}

/** Saves a block-style export, embedding the Chinese face only when the text needs it. */
async function saveSavedLearningPdf(blocks: string[], fileName: string) {
  const fontData = containsCjk(blocks.join(" ")) ? await loadPdfFontData() : null;
  createSavedLearningPdf(blocks, fontData).save(fileName);
}

export async function downloadMistakesPdf(entries: MistakeBookEntry[]) {
  await saveSavedLearningPdf(getMistakePdfBlocks(entries), "mistake-book.pdf");
}
export function getWeaknessReviewPdfBlocks(sheet: WeaknessReviewSheet): string[] {
  return [
    "PAPER QUIZ AI / PERSONAL REVIEW SHEET",
    ...sheet.items.map(
      (item, index) =>
        `${index + 1}. ${item.prompt}\nKey answer: ${item.keyAnswer}\nRemember: ${item.remember}\nNext: ${item.action}`,
    ),
  ];
}
export async function downloadWeaknessReviewPdf(sheet: WeaknessReviewSheet) {
  await saveSavedLearningPdf(getWeaknessReviewPdfBlocks(sheet), "personal-review-sheet.pdf");
}
export function getMaterialReviewPdfBlocks(sheet: MaterialReviewSheet): string[] {
  const snapshot = `Saved questions: ${sheet.questionCount}\nSaved mistakes: ${sheet.mistakeCount}\nPractice sessions: ${sheet.sessionCount}`;
  const weaknesses = sheet.weaknesses.length
    ? sheet.weaknesses.map(
        (item, index) =>
          `Weakness ${index + 1}: ${item.prompt}\nKey answer: ${item.keyAnswer}\nRemember: ${item.remember}\nSource: ${item.sourceNote || "Source section not recorded"}`,
      )
    : ["Weaknesses\nNo saved mistakes for this material yet."];
  const coverage = sheet.coverage.length
    ? sheet.coverage.map(
        (item) =>
          `Coverage: ${item.sourceNote} (${item.questionCount} question${item.questionCount === 1 ? "" : "s"})`,
      )
    : ["Coverage\nNo saved questions for this material yet."];

  return [
    "PAPER QUIZ AI / MATERIAL REVIEW SHEET",
    sheet.title,
    snapshot,
    ...weaknesses,
    ...coverage,
  ];
}
export async function downloadMaterialReviewPdf(sheet: MaterialReviewSheet) {
  await saveSavedLearningPdf(getMaterialReviewPdfBlocks(sheet), "material-review-sheet.pdf");
}
export function getExamReviewPdfBlocks(sheet: ExamReviewSheet): string[] {
  const sections = orderedReviewSections(sheet);
  if (sections.length) {
    return [
      "PAPER QUIZ AI / EXAM REVIEW",
      sheet.title,
      ...sections.map(({ section, number }) =>
        [
          `${number}. ${section.heading}`,
          ...section.items.map((item) => (item.label ? `${item.label}: ${item.body}` : item.body)),
        ].join("\n"),
      ),
    ];
  }

  return [
    "PAPER QUIZ AI / EXAM REVIEW",
    sheet.title,
    ...(sheet.topics ?? []).map((topic, index) =>
      [
        `${index + 1}. ${topic.topic}`,
        `Key ideas: ${topic.keyIdeas.join(" ")}`,
        ...(topic.formulaOrProcedure ? [`Formula or procedure: ${topic.formulaOrProcedure}`] : []),
        `Common confusion: ${topic.commonConfusion}`,
        ...(topic.mistakeFocus ? [`Your focus: ${topic.mistakeFocus}`] : []),
        `Source: ${topic.sourceNote}`,
      ].join("\n"),
    ),
  ];
}

// The review sheet prints as a two-column A4 revision page: a banner, sections flowing
// down the left and right columns, then the plan strip across the full width.
const SHEET_MARGIN = 14;
const SHEET_WIDTH = 210 - SHEET_MARGIN * 2;
const SHEET_GUTTER = 8;
const SHEET_COLUMN = (SHEET_WIDTH - SHEET_GUTTER) / 2;
const SHEET_BOTTOM = 282;

export function createExamReviewPdf(sheet: ExamReviewSheet, options: QuizPdfOptions = {}): jsPDF {
  const locale = options.locale ?? DEFAULT_LOCALE;
  const pdf = new jsPDF({ format: "a4", unit: "mm" });
  const family = registerPdfFont(pdf, options.fontData ?? null) ? PDF_CJK_FONT : "helvetica";
  const numbered = orderedReviewSections(sheet);

  const face = (style: "normal" | "bold", size: number, color: string = PALETTE.ink) => {
    pdf.setFont(family, style);
    pdf.setFontSize(size);
    pdf.setTextColor(color);
  };

  face("bold", 17, PALETTE.darkTeal);
  let y = 20;
  splitPdfTextToWidth(pdf, sheet.title, SHEET_WIDTH).forEach((line) => {
    pdf.text(line, 105, y, { align: "center" });
    y += 8;
  });
  pdf.setDrawColor(PALETTE.gold);
  pdf.setLineWidth(1.1);
  pdf.line(SHEET_MARGIN + 30, y - 1.5, 210 - SHEET_MARGIN - 30, y - 1.5);
  y += 4;

  const banner = [
    sheet.subject ? labelled(locale, translate(locale, "review.subject"), sheet.subject) : "",
    sheet.scope ? labelled(locale, translate(locale, "review.scope"), sheet.scope) : "",
    sheet.goal ? labelled(locale, translate(locale, "review.goal"), sheet.goal) : "",
  ].filter(Boolean);
  if (banner.length) {
    face("normal", 9, PALETTE.muted);
    pdf.text(banner.join("     "), 105, y, { align: "center" });
    y += 6;
  }

  const columnTop = y + 2;

  /** Draws one numbered section into a column and returns the y it finished at. */
  const drawSection = (
    entry: { section: ExamReviewSection; number: number },
    x: number,
    width: number,
    top: number,
  ) => {
    let cursor = top;
    face("bold", 10, PALETTE.teal);
    splitPdfTextToWidth(pdf, `${entry.number}. ${entry.section.heading}`, width).forEach((line) => {
      pdf.text(line, x, cursor);
      cursor += 5;
    });
    pdf.setDrawColor(PALETTE.line);
    pdf.setLineWidth(0.4);
    pdf.line(x, cursor - 2.6, x + width, cursor - 2.6);
    cursor += 1.5;

    entry.section.items.forEach((item) => {
      pdf.setFillColor(PALETTE.mint);
      pdf.circle(x + 1.2, cursor - 1.3, 0.7, "F");
      if (item.label) {
        face("bold", 8.5, PALETTE.darkTeal);
        splitPdfTextToWidth(pdf, item.label, width - 5).forEach((line) => {
          pdf.text(line, x + 4, cursor);
          cursor += 4.1;
        });
      }
      face("normal", 8.5, PALETTE.ink);
      splitPdfTextToWidth(pdf, item.body, width - 5).forEach((line) => {
        pdf.text(line, x + 4, cursor);
        cursor += 4.1;
      });
      cursor += 1.8;
    });

    return cursor + 4;
  };

  const columns = [
    { kinds: REVIEW_LEFT_COLUMN, x: SHEET_MARGIN },
    { kinds: REVIEW_RIGHT_COLUMN, x: SHEET_MARGIN + SHEET_COLUMN + SHEET_GUTTER },
  ];
  let columnBottom = columnTop;
  columns.forEach((column) => {
    let cursor = columnTop;
    numbered
      .filter((entry) => column.kinds.includes(entry.section.kind))
      .forEach((entry) => {
        cursor = drawSection(entry, column.x, SHEET_COLUMN, cursor);
      });
    columnBottom = Math.max(columnBottom, cursor);
  });

  // The centre rule is drawn once both columns are measured so it spans their full run.
  pdf.setDrawColor(PALETTE.line);
  pdf.setLineWidth(0.4);
  const ruleX = SHEET_MARGIN + SHEET_COLUMN + SHEET_GUTTER / 2;
  pdf.line(ruleX, columnTop - 2, ruleX, Math.min(columnBottom, SHEET_BOTTOM));

  numbered
    .filter((entry) => REVIEW_FULL_WIDTH.includes(entry.section.kind))
    .forEach((entry) => {
      columnBottom = drawSection(entry, SHEET_MARGIN, SHEET_WIDTH, columnBottom + 3);
    });

  if (sheet.sourceNote) {
    face("normal", 7.5, PALETTE.muted);
    pdf.text(
      labelled(locale, translate(locale, "exam.source"), sheet.sourceNote),
      SHEET_MARGIN,
      Math.min(columnBottom + 2, 290),
    );
  }

  return pdf;
}

export async function downloadExamReviewPdf(
  sheet: ExamReviewSheet,
  locale: Locale = DEFAULT_LOCALE,
) {
  // Sheets saved before the two-column layout still print through the block exporter.
  if (!sheet.sections?.length) {
    await saveSavedLearningPdf(getExamReviewPdfBlocks(sheet), "exam-review-sheet.pdf");
    return;
  }
  const text = [
    sheet.title,
    sheet.subject ?? "",
    sheet.scope ?? "",
    sheet.goal ?? "",
    ...sheet.sections.flatMap((section) => [
      section.heading,
      ...section.items.flatMap((item) => [item.label, item.body]),
    ]),
  ].join(" ");
  const fontData = locale === "zh" || containsCjk(text) ? await loadPdfFontData() : null;
  createExamReviewPdf(sheet, { locale, fontData }).save("exam-review-sheet.pdf");
}
export async function downloadReviewPdf(session: StudySession) {
  await saveSavedLearningPdf(getReviewPdfBlocks(session), "graded-quiz-review.pdf");
}
export function getProgressPdfBlocks(sessions: StudySession[]): string[] {
  return [
    "PAPER QUIZ AI / PROGRESS REPORT",
    `Completed practice sets: ${sessions.length}\nYour learning story is built one practice set at a time.`,
    ...sessions.map(
      (session) =>
        `${new Date(session.createdAt).toLocaleDateString()}\n${session.title}\n${session.questions.length} questions | ${getSessionAccuracy(session)}% accuracy`,
    ),
  ];
}

export async function downloadProgressPdf(sessions: StudySession[]) {
  await saveSavedLearningPdf(getProgressPdfBlocks(sessions), "learning-progress.pdf");
}
