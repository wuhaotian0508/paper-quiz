import { z } from "zod";
import { correctAnswerText, questionKey, type Question } from "@/lib/quiz";

/**
 * What a learner can tell us when the model gets a question wrong.
 *
 * Generation is grounded in the uploaded material, but it still invents an answer key,
 * writes four options that are all defensible, or asks about something the lecture never
 * covered. Until now the only route for that was the general feedback form, which asks the
 * learner to describe a question we already have on screen. This carries the question with
 * the complaint, so a report is actionable without a reply.
 */
export const QUESTION_REPORT_REASONS = [
  "wrong_answer",
  "bad_options",
  "not_in_source",
  "unclear",
  "other",
] as const;
export type QuestionReportReason = (typeof QUESTION_REPORT_REASONS)[number];

export const MAX_REPORT_NOTE_CHARS = 500;
const MAX_REPORT_FIELD_CHARS = 2_000;

/** Broken options are a multiple-choice failure; offering it elsewhere only adds noise. */
export function reportReasonsFor(type: Question["type"]): QuestionReportReason[] {
  return QUESTION_REPORT_REASONS.filter(
    (reason) => reason !== "bad_options" || type === "multiple_choice",
  );
}

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => value ?? "");

export const QuestionReportSchema = z
  .object({
    reason: z.enum(QUESTION_REPORT_REASONS),
    note: optionalText(MAX_REPORT_NOTE_CHARS),
    /** Content-derived, so the same bad question reported from two quizzes lands on one key. */
    questionKey: z.string().trim().min(1).max(100),
    questionType: z.string().trim().min(1).max(40),
    prompt: z.string().trim().min(1).max(MAX_REPORT_FIELD_CHARS),
    correctAnswer: optionalText(MAX_REPORT_FIELD_CHARS),
    sourceNote: optionalText(300),
    quizTitle: optionalText(200),
    materialName: optionalText(200),
    locale: z.enum(["en", "zh"]).optional().default("en"),
  })
  .strict();

export type QuestionReport = z.infer<typeof QuestionReportSchema>;

export function parseQuestionReport(
  raw: unknown,
): { ok: true; value: QuestionReport } | { ok: false; error: string } {
  const parsed = QuestionReportSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "The report is incomplete or too long." };
  return { ok: true, value: parsed.data };
}

/**
 * Everything the report carries about the question. Deliberately the question and its
 * answer key only: the source PDF stays on the learner's side of the wire, exactly as it
 * does for a shared challenge.
 */
export function buildQuestionReport(
  question: Question,
  reason: QuestionReportReason,
  context: { note?: string; quizTitle?: string; materialName?: string; locale?: "en" | "zh" } = {},
): QuestionReport {
  return QuestionReportSchema.parse({
    reason,
    note: context.note?.trim().slice(0, MAX_REPORT_NOTE_CHARS) || undefined,
    questionKey: questionKey(question),
    questionType: question.type,
    prompt: question.prompt,
    correctAnswer: correctAnswerText(question).slice(0, MAX_REPORT_FIELD_CHARS),
    sourceNote: question.sourceNote,
    quizTitle: context.quizTitle,
    materialName: context.materialName,
    locale: context.locale,
  });
}

/**
 * Which questions this browser has already reported.
 *
 * Local only, and not synced: its whole job is to stop the same learner filing the same
 * complaint twice and to keep the card honest about what it has already sent. The report
 * that matters is the one on the server.
 */
export const QUESTION_REPORTS_KEY = "paper-quiz-question-reports-v1";
const MAX_REMEMBERED_REPORTS = 200;

export type ReportedQuestion = {
  key: string;
  reason: QuestionReportReason;
  reportedAt: string;
};

export function readReportedQuestions(value: string | null): ReportedQuestion[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    const seen = new Set<string>();
    return parsed
      .filter(
        (entry): entry is ReportedQuestion =>
          Boolean(entry) &&
          typeof entry === "object" &&
          typeof (entry as ReportedQuestion).key === "string" &&
          QUESTION_REPORT_REASONS.includes((entry as ReportedQuestion).reason),
      )
      .filter((entry) => !seen.has(entry.key) && seen.add(entry.key))
      .slice(0, MAX_REMEMBERED_REPORTS);
  } catch {
    return [];
  }
}

export function hasReportedQuestion(entries: ReportedQuestion[], key: string): boolean {
  return entries.some((entry) => entry.key === key);
}

export function addReportedQuestion(
  entries: ReportedQuestion[],
  key: string,
  reason: QuestionReportReason,
  now: Date = new Date(),
): ReportedQuestion[] {
  const entry: ReportedQuestion = { key, reason, reportedAt: now.toISOString() };
  return [entry, ...entries.filter((item) => item.key !== key)].slice(0, MAX_REMEMBERED_REPORTS);
}
