import { questionKey, type GradeResult, type Question } from "@/lib/quiz";
import { boundSource, EMPTY_SOURCE, type PersistedSource } from "@/lib/study-history";
import {
  boundReviewState,
  createReviewState,
  isMastered,
  scheduleAfterGrade,
  seedReviewState,
  type ReviewState,
} from "@/lib/review-schedule";

export type MistakeBookEntry = {
  version: 1;
  id: string;
  question: Question;
  answer: string;
  status: "partial" | "incorrect";
  score: number;
  feedback: string;
  missingPoints: string[];
  updatedAt: string;
  /** Kept so re-practising a written question can still be graded after a reload. */
  source: PersistedSource;
  /**
   * Where this question sits on the Ebbinghaus ladder. Optional because books written
   * before scheduling existed have none; `seedReviewState` derives one from `updatedAt`
   * on demand, so those books still produce a review plan without a migration pass.
   */
  review?: ReviewState;
};

/**
 * Keyed on question content, not `question.id`: every quiz numbers from q1, so keying on
 * the id made each new quiz's first mistake evict the previous one. Two quizzes that
 * genuinely ask the same thing still collapse into one entry.
 */
export const mistakeKey = questionKey;

export function readMistakes(value: string | null): MistakeBookEntry[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    const seen = new Set<string>();
    return (
      parsed
        .filter((entry): entry is MistakeBookEntry =>
          Boolean(
            entry &&
              typeof entry === "object" &&
              "version" in entry &&
              (entry as MistakeBookEntry).version === 1 &&
              typeof (entry as MistakeBookEntry).id === "string" &&
              "question" in entry,
          ),
        )
        // Entries written before source tracking existed load without a source.
        // Ids are recomputed so books saved under the old per-quiz ids keep deduping.
        .map((entry) => ({
          ...entry,
          id: mistakeKey(entry.question),
          source: boundSource(entry.source),
          review: boundReviewState(entry.review),
        }))
        // Newest first on disk, so the first occurrence of a key is the one to keep.
        .filter((entry) => !seen.has(entry.id) && seen.add(entry.id))
    );
  } catch {
    return [];
  }
}

/**
 * Records the outcome of answering a question and advances its place in the review
 * schedule.
 *
 * Unlike the original write-only version, a *correct* answer is no longer discarded: for a
 * question already in the book it promotes the card, and promoting out of the last box
 * removes the entry entirely. That graduation is the book's only automatic exit — without
 * it a mistake stays forever and the book only grows.
 *
 * A correct answer on a question that was never missed still records nothing, and a repeat
 * mistake keeps the newest wrong answer as the thing worth re-reading.
 */
export function addMistake(
  entries: MistakeBookEntry[],
  question: Question,
  answer: string,
  grade: GradeResult,
  source: PersistedSource = EMPTY_SOURCE,
  now: Date = new Date(),
): MistakeBookEntry[] {
  const id = mistakeKey(question);
  const existing = entries.find((entry) => entry.id === id);
  // A first-time mistake enters the ladder rather than being scheduled as a lapse: `lapses`
  // counts forgetting something already on a schedule, and the first miss is not that.
  const review = existing
    ? scheduleAfterGrade(seedReviewState(existing, now), grade.status, now)
    : createReviewState(now);
  const updatedAt = now.toISOString();

  if (grade.status === "correct") {
    if (!existing) return entries;
    if (isMastered(review)) return entries.filter((entry) => entry.id !== id);
    // The recorded wrong answer and feedback stay: they are what the entry is for. Only
    // the schedule moves, and `updatedAt` bumps so another device picks the promotion up.
    return entries.map((entry) => (entry.id === id ? { ...entry, review, updatedAt } : entry));
  }

  const entry: MistakeBookEntry = {
    version: 1,
    id,
    question,
    answer,
    status: grade.status,
    score: grade.score,
    feedback: grade.feedback,
    missingPoints: grade.missingPoints,
    updatedAt,
    source: boundSource(source),
    review,
  };
  return [entry, ...entries.filter((existing) => existing.id !== id)];
}

export const MISTAKE_BOOK_KEY = "paper-plane-quiz-mistakes-v1";
