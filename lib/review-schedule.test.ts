import { describe, expect, it } from "vitest";
import {
  boundReviewState,
  createReviewState,
  dueEntries,
  forecastDueCounts,
  isDue,
  isMastered,
  MASTERED_BOX,
  overdueDays,
  REVIEW_INTERVAL_DAYS,
  reviewDateKey,
  scheduleAfterGrade,
  seedReviewState,
  type Reviewable,
} from "./review-schedule";

const at = (iso: string) => new Date(iso);
const monday = at("2026-08-03T09:00:00");

const entry = (id: string, updatedAt: string, review?: Reviewable["review"]): Reviewable => ({
  id,
  updatedAt,
  review,
});

describe("review schedule", () => {
  it("schedules a new mistake for tomorrow", () => {
    const state = createReviewState(monday);

    expect(state.box).toBe(0);
    expect(state.lapses).toBe(0);
    expect(reviewDateKey(new Date(state.dueAt))).toBe("2026-08-04");
  });

  it("walks the Ebbinghaus ladder on repeated correct answers", () => {
    let state = createReviewState(monday);
    let now = monday;
    const intervals: number[] = [];

    for (let step = 0; step < REVIEW_INTERVAL_DAYS.length - 1; step += 1) {
      now = new Date(state.dueAt);
      state = scheduleAfterGrade(state, "correct", now);
      intervals.push(Math.round((Date.parse(state.dueAt) - now.getTime()) / 86_400_000));
    }

    expect(intervals).toEqual([...REVIEW_INTERVAL_DAYS.slice(1)]);
  });

  it("graduates a card answered correctly from the last box", () => {
    const lastBox = { ...createReviewState(monday), box: MASTERED_BOX - 1 };

    const graduated = scheduleAfterGrade(lastBox, "correct", monday);

    expect(isMastered(graduated)).toBe(true);
    expect(graduated.dueAt).toBe("");
    expect(isDue(graduated, at("2030-01-01T09:00:00"))).toBe(false);
  });

  it("resets to the first box and records a lapse on a wrong answer", () => {
    const advanced = { ...createReviewState(monday), box: 4, lapses: 1 };

    const reset = scheduleAfterGrade(advanced, "incorrect", monday);

    expect(reset.box).toBe(0);
    expect(reset.lapses).toBe(2);
    expect(reviewDateKey(new Date(reset.dueAt))).toBe("2026-08-04");
  });

  it("holds the box on a partial answer without charging a lapse", () => {
    const advanced = { ...createReviewState(monday), box: 3, lapses: 1 };

    const held = scheduleAfterGrade(advanced, "partial", monday);

    expect(held.box).toBe(3);
    expect(held.lapses).toBe(1);
    expect(reviewDateKey(new Date(held.dueAt))).toBe("2026-08-04");
  });

  it("treats a card as due for the whole of its due day, not from the hour it was graded", () => {
    const state = createReviewState(at("2026-08-03T21:30:00"));

    expect(isDue(state, at("2026-08-04T00:05:00"))).toBe(true);
  });

  it("seeds an entry saved before scheduling existed from when it was last touched", () => {
    const legacy = entry("old", "2026-07-01T10:00:00.000Z");

    const seeded = seedReviewState(legacy, monday);

    expect(seeded.box).toBe(0);
    // Never reviewed and long past its first interval, so it is owed now.
    expect(isDue(seeded, monday)).toBe(true);
  });

  it("orders the due queue by how overdue each card is, then by lapses", () => {
    const queue = [
      entry("due-today", "2026-08-02T09:00:00.000Z", {
        version: 1,
        box: 0,
        dueAt: at("2026-08-03T00:00:00").toISOString(),
        lastReviewedAt: "2026-08-02T09:00:00.000Z",
        lapses: 5,
      }),
      entry("very-late", "2026-07-20T09:00:00.000Z", {
        version: 1,
        box: 1,
        dueAt: at("2026-07-25T00:00:00").toISOString(),
        lastReviewedAt: "2026-07-20T09:00:00.000Z",
        lapses: 0,
      }),
      entry("not-yet", "2026-08-02T09:00:00.000Z", {
        version: 1,
        box: 2,
        dueAt: at("2026-08-20T00:00:00").toISOString(),
        lastReviewedAt: "2026-08-02T09:00:00.000Z",
        lapses: 0,
      }),
    ];

    expect(dueEntries(queue, monday).map((item) => item.id)).toEqual(["very-late", "due-today"]);
  });

  it("counts overdue cards on today rather than the day they were missed", () => {
    const missed = entry("missed", "2026-07-20T09:00:00.000Z", {
      version: 1,
      box: 0,
      dueAt: at("2026-07-25T00:00:00").toISOString(),
      lastReviewedAt: "2026-07-20T09:00:00.000Z",
      lapses: 0,
    });
    const upcoming = entry("upcoming", "2026-08-02T09:00:00.000Z", {
      version: 1,
      box: 1,
      dueAt: at("2026-08-06T00:00:00").toISOString(),
      lastReviewedAt: "2026-08-02T09:00:00.000Z",
      lapses: 0,
    });

    const counts = forecastDueCounts([missed, upcoming], monday);

    expect(counts).toEqual({ "2026-08-03": 1, "2026-08-06": 1 });
    expect(overdueDays(missed.review, monday)).toBe(9);
  });

  it("leaves mastered and far-future cards out of the forecast", () => {
    const mastered = entry("done", "2026-08-01T09:00:00.000Z", {
      version: 1,
      box: MASTERED_BOX,
      dueAt: "",
      lastReviewedAt: "2026-08-01T09:00:00.000Z",
      lapses: 0,
    });
    const beyondHorizon = entry("later", "2026-08-01T09:00:00.000Z", {
      version: 1,
      box: 5,
      dueAt: at("2026-12-01T00:00:00").toISOString(),
      lastReviewedAt: "2026-08-01T09:00:00.000Z",
      lapses: 0,
    });

    expect(forecastDueCounts([mastered, beyondHorizon], monday)).toEqual({});
  });

  it("drops an unreadable persisted state instead of throwing", () => {
    expect(boundReviewState({ version: 2, box: 0 })).toBeUndefined();
    expect(boundReviewState(null)).toBeUndefined();
    expect(boundReviewState(createReviewState(monday))).toEqual(createReviewState(monday));
  });
});
