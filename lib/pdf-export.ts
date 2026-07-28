import { jsPDF } from "jspdf";
import type { MistakeBookEntry } from "@/lib/mistake-book";
import type { GradeResult, Question, Quiz } from "@/lib/quiz";
import { getSessionAccuracy, type StudySession } from "@/lib/study-history";

export type QuizExportMode = "student" | "answer_key";

export function getQuizExportFileName(mode: QuizExportMode) {
  return mode === "student" ? "paper-quiz-student-copy.pdf" : "paper-quiz-answer-key.pdf";
}

const PAGE_WIDTH = 210;
const PAGE_HEIGHT = 297;
const SIDE_MARGIN = 12;
const CONTENT_WIDTH = PAGE_WIDTH - SIDE_MARGIN * 2;
const CONTENT_BOTTOM = 282;
const PALETTE = {
  coral: "#EF7256",
  blue: "#4779D6",
  mint: "#39A98B",
  paleMint: "#DCEFE8",
  yellow: "#FFCF58",
  ink: "#243047",
  muted: "#61708B",
  paper: "#FFF9F1",
};

function questionTypeLabel(question: Question) {
  if (question.type === "multiple_choice") return "MULTIPLE CHOICE";
  if (question.type === "fill_blank") return "FILL IN THE BLANK";
  if (question.type === "short_answer") return "SHORT ANSWER";
  return (question.customLabel || "CUSTOM").toUpperCase();
}

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

export function getQuestionTypeBadgeLines(question: Question): string[] {
  return splitWordsForPdf(questionTypeLabel(question), 22);
}

function questionTypeColor(question: Question) {
  if (question.type === "multiple_choice") return PALETTE.blue;
  if (question.type === "fill_blank") return PALETTE.mint;
  if (question.type === "short_answer") return PALETTE.coral;
  return PALETTE.yellow;
}

function questionAnswer(question: Question) {
  return question.type === "multiple_choice"
    ? question.options.find((option) => option.id === question.correctOptionId)?.text || ""
    : question.referenceAnswer;
}

export function getQuizPdfBlocks(quiz: Quiz, mode: QuizExportMode): string[] {
  const header = mode === "student" ? "PAPER QUIZ AI / STUDENT COPY" : "PAPER QUIZ AI / ANSWER KEY";
  const blocks = [header, quiz.title, quiz.summary];

  quiz.questions.forEach((question, index) => {
    const questionLines = [`${index + 1}. ${question.prompt}`, questionTypeLabel(question)];
    if (question.type === "multiple_choice")
      question.options.forEach((option) =>
        questionLines.push(`${option.id.toUpperCase()}. ${option.text}`),
      );
    if (mode === "answer_key") {
      questionLines.push(
        "ANSWER + EXPLANATION",
        `Correct answer: ${questionAnswer(question)}`,
        question.explanation,
        `Source: ${question.sourceNote}`,
      );
    }
    blocks.push(questionLines.join("\n"));
  });

  return blocks;
}

export function createQuizPdf(quiz: Quiz, mode: QuizExportMode): jsPDF {
  const pdf = new jsPDF({ format: "a4", unit: "mm" });
  let pageNumber = 0;
  let y = 0;

  const drawHeader = (firstPage: boolean) => {
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(12);
    const headerTitleLines = splitPdfTextToWidth(pdf, quiz.title, CONTENT_WIDTH);
    const headerHeight = 15 + Math.max(0, headerTitleLines.length - 1) * 4.5;
    pageNumber += 1;
    pdf.setFillColor(PALETTE.paper);
    pdf.rect(0, 0, PAGE_WIDTH, PAGE_HEIGHT, "F");
    pdf.setFillColor(mode === "student" ? PALETTE.coral : PALETTE.blue);
    pdf.rect(0, 0, PAGE_WIDTH, headerHeight, "F");
    pdf.setTextColor("#FFFFFF");
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(8);
    pdf.text(
      mode === "student" ? "PAPER QUIZ AI / STUDENT COPY" : "PAPER QUIZ AI / ANSWER KEY",
      SIDE_MARGIN,
      6.5,
    );
    pdf.setFontSize(12);
    pdf.text(headerTitleLines, SIDE_MARGIN, 12, { lineHeightFactor: 1.1 });
    pdf.setDrawColor("#D8DEEA");
    pdf.line(SIDE_MARGIN, 287, PAGE_WIDTH - SIDE_MARGIN, 287);
    pdf.setTextColor(PALETTE.muted);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(7.5);
    pdf.text("Paper Quiz Studio", SIDE_MARGIN, 292);
    pdf.text(`Page ${pageNumber}`, PAGE_WIDTH - SIDE_MARGIN, 292, { align: "right" });
    y = headerHeight + 7;

    if (firstPage && mode === "student") {
      pdf.setFillColor(PALETTE.yellow);
      pdf.roundedRect(SIDE_MARGIN, y, CONTENT_WIDTH, 15, 2, 2, "F");
      pdf.setTextColor(PALETTE.ink);
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(8.5);
      pdf.text("Name:", SIDE_MARGIN + 4, y + 6);
      pdf.setFont("helvetica", "normal");
      pdf.line(SIDE_MARGIN + 15, y + 6.5, SIDE_MARGIN + 83, y + 6.5);
      pdf.setFont("helvetica", "bold");
      pdf.text("Date:", SIDE_MARGIN + 96, y + 6);
      pdf.setFont("helvetica", "normal");
      pdf.line(SIDE_MARGIN + 106, y + 6.5, PAGE_WIDTH - SIDE_MARGIN - 4, y + 6.5);
      pdf.setFontSize(7.5);
      pdf.text("Take it one question at a time. You have got this!", SIDE_MARGIN + 4, y + 11.5);
      y += 21;
    }
  };

  const newPage = () => {
    pdf.addPage();
    drawHeader(false);
  };

  const ensureSpace = (height: number) => {
    if (y + height > CONTENT_BOTTOM) newPage();
  };

  const wrappedText = (
    text: string,
    x: number,
    width: number,
    fontSize: number,
    color = PALETTE.ink,
    lineHeight = 4.5,
  ) => {
    pdf.setTextColor(color);
    pdf.setFontSize(fontSize);
    const wrapped = splitPdfTextToWidth(pdf, text, width);
    wrapped.forEach((line) => {
      ensureSpace(lineHeight);
      pdf.text(line, x, y);
      y += lineHeight;
    });
  };

  const ruledLines = (count: number) => {
    for (let line = 0; line < count; line += 1) {
      ensureSpace(5);
      pdf.setDrawColor("#B9C5D8");
      pdf.line(SIDE_MARGIN + 2, y + 2, PAGE_WIDTH - SIDE_MARGIN - 2, y + 2);
      y += 5;
    }
  };

  drawHeader(true);
  let previousType = "";

  quiz.questions.forEach((question, index) => {
    const typeLabel = questionTypeLabel(question);
    if (typeLabel !== previousType) {
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(7.5);
      const badgeLines = splitPdfTextToWidth(pdf, typeLabel, 46);
      const badgeHeight = badgeLines.length * 3.2 + 3;
      ensureSpace(badgeHeight + 3.5);
      pdf.setFillColor(questionTypeColor(question));
      pdf.roundedRect(SIDE_MARGIN, y, 52, badgeHeight, 1.5, 1.5, "F");
      pdf.setTextColor(question.type === "custom" ? PALETTE.ink : "#FFFFFF");
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(7.5);
      pdf.text(badgeLines, SIDE_MARGIN + 3, y + 3.9, { lineHeightFactor: 1.05 });
      y += badgeHeight + 3.5;
      previousType = typeLabel;
    }

    ensureSpace(12);
    pdf.setTextColor(PALETTE.ink);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(9.5);
    wrappedText(
      `${index + 1}. ${question.prompt}`,
      SIDE_MARGIN,
      CONTENT_WIDTH,
      9.5,
      PALETTE.ink,
      4.6,
    );
    y += 1;

    if (mode === "student") {
      if (question.type === "multiple_choice") {
        for (let optionIndex = 0; optionIndex < question.options.length; optionIndex += 2) {
          const pair = question.options.slice(optionIndex, optionIndex + 2);
          const optionWidth = 89;
          pdf.setFontSize(8);
          const optionLines = pair.map((option) =>
            splitPdfTextToWidth(pdf, option.text, optionWidth - 12),
          );
          const rowHeight = Math.max(...optionLines.map((text) => text.length * 3.5 + 5), 8);
          ensureSpace(rowHeight + 2);
          pair.forEach((option, column) => {
            const x = SIDE_MARGIN + column * 94;
            pdf.setFillColor(column === 0 ? PALETTE.paleMint : "#EAF0FD");
            pdf.roundedRect(x, y, optionWidth, rowHeight, 1.5, 1.5, "F");
            pdf.setTextColor(PALETTE.ink);
            pdf.setFont("helvetica", "bold");
            pdf.setFontSize(8);
            pdf.text(`${option.id.toUpperCase()}.`, x + 3, y + 4.5);
            pdf.setFont("helvetica", "normal");
            pdf.text(optionLines[column], x + 9, y + 4.5, { lineHeightFactor: 1.1 });
          });
          y += rowHeight + 2;
        }
      } else if (question.type === "fill_blank") {
        ruledLines(question.prompt.length > 100 ? 2 : 1);
      } else {
        ruledLines(4);
      }
    } else {
      ensureSpace(7);
      const panelText = [
        "ANSWER + EXPLANATION",
        `Correct answer: ${questionAnswer(question)}`,
        question.explanation,
        `Source: ${question.sourceNote}`,
      ];
      const measuredLines = panelText.flatMap((line) =>
        splitPdfTextToWidth(pdf, line, CONTENT_WIDTH - 10),
      );
      const panelHeight = Math.max(16, measuredLines.length * 3.8 + 8);
      ensureSpace(panelHeight + 2);
      const panelStart = y;
      pdf.setFillColor("#FFF0DB");
      pdf.roundedRect(SIDE_MARGIN, panelStart, CONTENT_WIDTH, panelHeight, 1.5, 1.5, "F");
      y = panelStart + 4.5;
      pdf.setFont("helvetica", "bold");
      wrappedText(
        "ANSWER + EXPLANATION",
        SIDE_MARGIN + 4,
        CONTENT_WIDTH - 8,
        7.5,
        PALETTE.coral,
        3.8,
      );
      pdf.setFont("helvetica", "bold");
      wrappedText(
        `Correct answer: ${questionAnswer(question)}`,
        SIDE_MARGIN + 4,
        CONTENT_WIDTH - 8,
        8,
        PALETTE.ink,
        3.8,
      );
      pdf.setFont("helvetica", "normal");
      wrappedText(question.explanation, SIDE_MARGIN + 4, CONTENT_WIDTH - 8, 7.5, PALETTE.ink, 3.8);
      wrappedText(
        `Source: ${question.sourceNote}`,
        SIDE_MARGIN + 4,
        CONTENT_WIDTH - 8,
        7,
        PALETTE.muted,
        3.8,
      );
      y = Math.max(y, panelStart + panelHeight) + 1;
    }

    y += 4;
  });

  return pdf;
}

function correctAnswer(question: Question) {
  return question.type === "multiple_choice"
    ? question.options.find((option) => option.id === question.correctOptionId)?.text || ""
    : question.referenceAnswer;
}
export function downloadQuizPdf(quiz: Quiz, mode: QuizExportMode) {
  createQuizPdf(quiz, mode).save(getQuizExportFileName(mode));
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

export function createSavedLearningPdf(blocks: string[]): jsPDF {
  const pdf = new jsPDF({ format: "a4", unit: "mm" });
  const [heading, ...entries] = blocks;
  let page = 0;
  let y = 0;
  const drawPage = () => {
    page += 1;
    pdf.setFillColor(PALETTE.paper);
    pdf.rect(0, 0, PAGE_WIDTH, PAGE_HEIGHT, "F");
    pdf.setFillColor(PALETTE.blue);
    pdf.rect(0, 0, PAGE_WIDTH, 16, "F");
    pdf.setTextColor("#FFFFFF");
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(9);
    pdf.text(heading, SIDE_MARGIN, 10);
    pdf.setDrawColor("#D8DEEA");
    pdf.line(SIDE_MARGIN, 287, PAGE_WIDTH - SIDE_MARGIN, 287);
    pdf.setTextColor(PALETTE.muted);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(7.5);
    pdf.text("Paper Quiz Studio", SIDE_MARGIN, 292);
    pdf.text(`Page ${page}`, PAGE_WIDTH - SIDE_MARGIN, 292, { align: "right" });
    y = 24;
  };
  drawPage();

  entries.forEach((entry) => {
    pdf.setFont("helvetica", "normal");
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
    pdf.roundedRect(SIDE_MARGIN, y, CONTENT_WIDTH, blockHeight, 1.5, 1.5, "F");
    pdf.setTextColor(PALETTE.ink);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    blockLines.forEach((line, lineIndex) => pdf.text(line, SIDE_MARGIN + 4, y + 5 + lineIndex * 4));
    y += blockHeight + 4;
  });
  return pdf;
}

export function downloadMistakesPdf(entries: MistakeBookEntry[]) {
  createSavedLearningPdf(getMistakePdfBlocks(entries)).save("mistake-book.pdf");
}
export function downloadReviewPdf(session: StudySession) {
  createSavedLearningPdf(getReviewPdfBlocks(session)).save("graded-quiz-review.pdf");
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

export function downloadProgressPdf(sessions: StudySession[]) {
  createSavedLearningPdf(getProgressPdfBlocks(sessions)).save("learning-progress.pdf");
}
