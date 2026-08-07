import { z } from "zod";
import type { GradeResult } from "@/lib/quiz";

/**
 * Spaced repetition over the mistake book, on the Ebbinghaus ladder.
 *
 * Deliberately generic over `{ id, updatedAt, review? }` rather than importing
 * `MistakeBookEntry`: the mistake book imports *this* module to parse its own review
 * state, so a dependency the other way would be circular.
 *
 * Everything here is a pure function of `(state, outcome, now)`. No model call, no clock
 * read outside the injected `now`, so every schedule decision is testable.
 */

/**
 * The classic Ebbinghaus review ladder, in days. A card that keeps being answered
 * correctly is seen on day 1, 3, 7, 14, 29, 59 after the mistake was made.
 *
 * The true forgetting curve starts at 5 minutes / 30 minutes / 12 hours, but the calendar
 * this feeds buckets by day and cannot express sub-day steps. Starting the ladder at one
 * day is the honest approximation, not an oversight.
 */
export const REVIEW_INTERVAL_DAYS = [1, 2, 4, 7, 15, 30] as const;

/**
 * Answering correctly from the last box graduates the card: it leaves the due queue for
 * good and its mistake can be archived. Without this the mistake book only ever grows.
 */
export const MASTERED_BOX = REVIEW_INTERVAL_DAYS.length;

export type ReviewState = {
  version: 1;
  /** How many consecutive correct reviews. Indexes `REVIEW_INTERVAL_DAYS`; `MASTERED_BOX` means graduated. */
  box: number;
  /** When this card next wants to be seen. Empty once mastered — a graduated card has no next date. */
  dueAt: string;
  lastReviewedAt: string;
  /** How many times this card has been forgotten after being scheduled. Never reset; it is the honest difficulty signal. */
  lapses: number;
};

/** The minimum shape this module schedules. `MistakeBookEntry` satisfies it. */
export type Reviewable = { id: string; updatedAt: string; review?: ReviewState };

export const ReviewStateSchema = z.object({
  version: z.literal(1),
  box: z.number().int().min(0).max(MASTERED_BOX),
  dueAt: z.string(),
  lastReviewedAt: z.string(),
  lapses: z.number().int().min(0),
});

const MILLISECONDS_PER_DAY = 86_400_000;

/**
 * Local midnight, matching `sessionDateKey`'s local-time day boundaries. Scheduling in UTC
 * would put a card studied at 9pm in Beijing into the next day's bucket.
 */
export function startOfDay(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

export function addDays(value: Date, days: number): Date {
  const shifted = new Date(value);
  shifted.setDate(shifted.getDate() + days);
  return shifted;
}

/** Same format as `sessionDateKey`, so review buckets and practice buckets share calendar cells. */
export function reviewDateKey(value: Date): string {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

function intervalFor(box: number): number {
  return REVIEW_INTERVAL_DAYS[Math.min(box, REVIEW_INTERVAL_DAYS.length - 1)];
}

/** Due dates land on midnight so "due today" is true for the whole day, not from the hour of the mistake. */
function dueAfter(box: number, from: Date): string {
  return startOfDay(addDays(from, intervalFor(box))).toISOString();
}

export function isMastered(state: ReviewState | undefined): boolean {
  return Boolean(state && state.box >= MASTERED_BOX);
}

/** A brand new mistake: box 0, first look tomorrow. */
export function createReviewState(now: Date = new Date()): ReviewState {
  return {
    version: 1,
    box: 0,
    dueAt: dueAfter(0, now),
    lastReviewedAt: now.toISOString(),
    lapses: 0,
  };
}

/**
 * Gives an entry saved before scheduling existed a state derived from when it was last
 * touched, so an existing mistake book produces a review plan immediately instead of
 * requiring every card to be answered once more first.
 *
 * Anything already older than its first interval comes back as due today, which is the
 * correct reading: it was never reviewed.
 */
export function seedReviewState(entry: Reviewable, now: Date = new Date()): ReviewState {
  if (entry.review) return entry.review;
  const recorded = Date.parse(entry.updatedAt);
  const from = Number.isNaN(recorded) ? now : new Date(recorded);
  return {
    version: 1,
    box: 0,
    dueAt: dueAfter(0, from),
    lastReviewedAt: from.toISOString(),
    lapses: 0,
  };
}

/**
 * Advances a card after it has been answered.
 *
 * - `correct` promotes one box, and out of the queue entirely from the last one.
 * - `partial` holds the box and asks again tomorrow. A half-remembered card has not been
 *   forgotten, so charging it a lapse would overstate the difficulty, but promoting it
 *   would stretch the interval on evidence that does not support it.
 * - `incorrect` resets to box 0 and records a lapse.
 */
export function scheduleAfterGrade(
  state: ReviewState | undefined,
  status: GradeResult["status"],
  now: Date = new Date(),
): ReviewState {
  const current = state ?? createReviewState(now);
  const reviewedAt = now.toISOString();

  if (status === "correct") {
    const box = Math.min(current.box + 1, MASTERED_BOX);
    return {
      ...current,
      box,
      // A graduated card has no next date; keeping a stale one would leave it in forecasts.
      dueAt: box >= MASTERED_BOX ? "" : dueAfter(box, now),
      lastReviewedAt: reviewedAt,
    };
  }

  if (status === "partial") {
    return { ...current, dueAt: dueAfter(0, now), lastReviewedAt: reviewedAt };
  }

  return {
    ...current,
    box: 0,
    dueAt: dueAfter(0, now),
    lastReviewedAt: reviewedAt,
    lapses: current.lapses + 1,
  };
}

/**
 * Whether a card wants to be seen by the end of `now`'s day. Compares day keys rather than
 * instants so a card due today is due from midnight, not from the exact hour it was graded.
 */
export function isDue(state: ReviewState | undefined, now: Date = new Date()): boolean {
  if (!state || isMastered(state) || !state.dueAt) return false;
  const due = Date.parse(state.dueAt);
  if (Number.isNaN(due)) return false;
  return startOfDay(new Date(due)).getTime() <= startOfDay(now).getTime();
}

/** How many days late a card is; 0 when due today, negative values clamped to 0. */
export function overdueDays(state: ReviewState | undefined, now: Date = new Date()): number {
  if (!state?.dueAt) return 0;
  const due = Date.parse(state.dueAt);
  if (Number.isNaN(due)) return 0;
  const difference = startOfDay(now).getTime() - startOfDay(new Date(due)).getTime();
  return Math.max(0, Math.round(difference / MILLISECONDS_PER_DAY));
}

/**
 * The cards to review now, most overdue first. Entries without a stored state are seeded
 * on the fly, so a book written before scheduling existed still yields a queue.
 *
 * Ties break on `lapses` so the card that has been forgotten most often is asked first.
 */
export function dueEntries<T extends Reviewable>(entries: readonly T[], now: Date = new Date()): T[] {
  return entries
    .filter((entry) => isDue(seedReviewState(entry, now), now))
    .sort((left, right) => {
      const leftState = seedReviewState(left, now);
      const rightState = seedReviewState(right, now);
      const byOverdue = overdueDays(rightState, now) - overdueDays(leftState, now);
      if (byOverdue !== 0) return byOverdue;
      return rightState.lapses - leftState.lapses;
    });
}

/**
 * Due counts per calendar day, for painting the month grid.
 *
 * Overdue cards all collapse onto today rather than staying on the day they were missed:
 * the calendar answers "what do I owe", and work owed is owed now. Past cells keep showing
 * what was actually practised, which is a different question and a different layer.
 */
export function forecastDueCounts(
  entries: readonly Reviewable[],
  now: Date = new Date(),
  days = 60,
): Record<string, number> {
  const todayKey = reviewDateKey(now);
  const horizon = startOfDay(addDays(now, days)).getTime();
  const counts: Record<string, number> = {};

  for (const entry of entries) {
    const state = seedReviewState(entry, now);
    if (isMastered(state) || !state.dueAt) continue;
    const due = Date.parse(state.dueAt);
    if (Number.isNaN(due)) continue;
    if (startOfDay(new Date(due)).getTime() > horizon) continue;
    const key = isDue(state, now) ? todayKey : reviewDateKey(new Date(due));
    counts[key] = (counts[key] ?? 0) + 1;
  }

  return counts;
}

/** Reads a persisted state, returning undefined rather than throwing so one bad record cannot empty a book. */
export function boundReviewState(value: unknown): ReviewState | undefined {
  const parsed = ReviewStateSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}
