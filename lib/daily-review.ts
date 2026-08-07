import type { MistakeBookEntry } from "@/lib/mistake-book";
import { dueEntries, overdueDays, seedReviewState } from "@/lib/review-schedule";
import { subjectsByMaterial, type StudyLibraryRecord } from "@/lib/study-library";
import { groupBySubject, UNASSIGNED_SUBJECT } from "@/lib/subject";

/**
 * Today's review papers: one per course, built from whatever the Ebbinghaus schedule says
 * is due.
 *
 * A paper is a *fixed set of questions to sit*, not a filtered list to browse — which is
 * why it is capped. Handing a student who skipped a fortnight a 90-question paper
 * guarantees they sit none of it, so the overflow stays queued and surfaces tomorrow.
 */

/**
 * Long enough to be worth sitting down for, short enough to finish in one go. Cards beyond
 * the cap are not lost: they stay due and lead the next day's paper, because the queue is
 * ordered by how overdue each card is.
 */
export const MAX_PAPER_QUESTIONS = 12;

export type DailyReviewPaper = {
  subject: string;
  /** The questions to sit today, most overdue first. Never longer than the cap. */
  entries: MistakeBookEntry[];
  /** Everything due for this course, including what the cap held back. */
  dueCount: number;
  /** How many of those are past their date rather than due today. Drives the "behind" badge. */
  overdueCount: number;
};

/**
 * Which course a mistake belongs to. Mistakes only record the material they came from, so
 * the subject is resolved through the library — the one place a subject is stored.
 */
export function subjectOfMistake(
  entry: MistakeBookEntry,
  subjects: Map<string, string>,
): string {
  return subjects.get(entry.source.materialId) ?? UNASSIGNED_SUBJECT;
}

/**
 * Builds one paper per course with cards due today. Courses with nothing due are omitted
 * entirely rather than returned empty, so the dashboard can render the result directly.
 */
export function buildDailyReviewPapers(
  mistakes: readonly MistakeBookEntry[],
  library: readonly StudyLibraryRecord[],
  now: Date = new Date(),
  limit: number = MAX_PAPER_QUESTIONS,
): DailyReviewPaper[] {
  const subjects = subjectsByMaterial(library);
  const due = dueEntries(mistakes, now);

  return groupBySubject(due, (entry) => subjectOfMistake(entry, subjects)).map(
    ({ subject, items }) => ({
      subject,
      // `dueEntries` already ordered the queue, and grouping preserves that order.
      entries: items.slice(0, limit),
      dueCount: items.length,
      overdueCount: items.filter((entry) => overdueDays(seedReviewState(entry, now), now) > 0)
        .length,
    }),
  );
}

/** Total cards due across every course, for the sidebar badge and the calendar's today cell. */
export function totalDueCount(papers: readonly DailyReviewPaper[]): number {
  return papers.reduce((total, paper) => total + paper.dueCount, 0);
}

/** Cards actually being handed out today, once each paper's cap is applied. */
export function totalPaperQuestions(papers: readonly DailyReviewPaper[]): number {
  return papers.reduce((total, paper) => total + paper.entries.length, 0);
}
