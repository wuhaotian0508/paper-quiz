import { translate, type Locale } from "@/lib/i18n";
import type { Question, Quiz } from "@/lib/quiz";

/**
 * Turns a generated quiz into the structure of a printed exam paper: a course banner,
 * a marks table, and numbered sections that group questions by type. Modelled on the
 * university mock papers the export is meant to match, so the model only has to supply
 * the header fields and per-question marks — numbering and totals are derived here.
 */

export type ExamSectionKind = "multiple_choice" | "fill_blank" | "written";

export type ExamPaperQuestion = { question: Question; number: number; points: number };

export type ExamPaperSection = {
  kind: ExamSectionKind;
  heading: string;
  points: number;
  /** True when marks vary inside the section, so each question prints its own value. */
  showsPerQuestionPoints: boolean;
  questions: ExamPaperQuestion[];
};

export type ExamPaper = {
  courseTitle: string;
  metaLine: string;
  identityFields: string[];
  scoreTable: { columns: string[]; rowLabel: string };
  sections: ExamPaperSection[];
  totalPoints: number;
};

const DEFAULT_POINTS: Record<Question["type"], number> = {
  multiple_choice: 3,
  fill_blank: 4,
  short_answer: 10,
  custom: 10,
};

const MINUTES_PER_QUESTION: Record<Question["type"], number> = {
  multiple_choice: 3,
  fill_blank: 4,
  short_answer: 12,
  custom: 12,
};

const SECTION_ORDER: ExamSectionKind[] = ["multiple_choice", "fill_blank", "written"];
const CJK_ORDINALS = ["一", "二", "三", "四", "五", "六", "七", "八", "九", "十"];
const ROMAN_ORDINALS = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];

export function examSectionKind(question: Question): ExamSectionKind {
  return question.type === "multiple_choice" || question.type === "fill_blank"
    ? question.type
    : "written";
}

export function questionPoints(question: Question): number {
  return question.points ?? DEFAULT_POINTS[question.type];
}

function examDuration(quiz: Quiz): number {
  const raw = quiz.questions.reduce(
    (total, question) => total + MINUTES_PER_QUESTION[question.type],
    0,
  );
  return Math.min(180, Math.max(30, Math.ceil(raw / 10) * 10));
}

function sectionTitleKey(kind: ExamSectionKind) {
  if (kind === "multiple_choice") return "exam.section.multipleChoice" as const;
  if (kind === "fill_blank") return "exam.section.fillBlank" as const;
  return "exam.section.written" as const;
}

export function buildExamPaper(quiz: Quiz, locale: Locale): ExamPaper {
  const ordinals = locale === "zh" ? CJK_ORDINALS : ROMAN_ORDINALS;
  const grouped = new Map<ExamSectionKind, ExamPaperQuestion[]>();

  // Number questions across the whole paper in section order, the way a printed paper
  // does, rather than in the order the model happened to emit them.
  let number = 0;
  for (const kind of SECTION_ORDER) {
    const questions = quiz.questions.filter((question) => examSectionKind(question) === kind);
    if (!questions.length) continue;
    grouped.set(
      kind,
      questions.map((question) => {
        number += 1;
        return { question, number, points: questionPoints(question) };
      }),
    );
  }

  const sections: ExamPaperSection[] = [...grouped].map(([kind, questions], index) => {
    const points = questions.reduce((total, item) => total + item.points, 0);
    const uniform = questions.every((item) => item.points === questions[0].points);
    const rule = uniform
      ? translate(locale, "exam.ruleUniform", { points: questions[0].points, total: points })
      : translate(locale, "exam.ruleMixed", { total: points });
    return {
      kind,
      heading: translate(locale, "exam.sectionHeading", {
        ordinal: ordinals[index] ?? String(index + 1),
        title: translate(locale, sectionTitleKey(kind)),
        rule,
      }),
      points,
      showsPerQuestionPoints: !uniform,
      questions,
    };
  });

  const totalPoints = sections.reduce((total, section) => total + section.points, 0);
  const header = quiz.examHeader;
  // Chinese titles usually close with a bracket that already separates the paper label.
  const courseTitle = header
    ? `${header.courseTitle}${/[》」』】）]$/.test(header.courseTitle) ? "" : " "}${header.paperLabel}`
    : quiz.title;

  return {
    courseTitle,
    metaLine: translate(locale, "exam.meta", {
      minutes: header?.durationMinutes ?? examDuration(quiz),
      points: totalPoints,
      scope: header?.scope ?? quiz.summary,
    }),
    identityFields: [
      translate(locale, "exam.name"),
      translate(locale, "exam.studentId"),
      translate(locale, "exam.class"),
    ],
    scoreTable: {
      columns: [
        translate(locale, "exam.scoreTable.section"),
        ...sections.map((_, index) => ordinals[index] ?? String(index + 1)),
        translate(locale, "exam.scoreTable.total"),
      ],
      rowLabel: translate(locale, "exam.scoreTable.score"),
    },
    sections,
    totalPoints,
  };
}
