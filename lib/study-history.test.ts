import { describe, expect, it } from "vitest";
import {
  addSession,
  getSessionAccuracy,
  groupSessionsByDate,
  EMPTY_SOURCE,
  readSessions,
  type StudySession,
} from "./study-history";

describe("study history", () => {
  it("keeps the newest session once per id", () => {
    const first = addSession([], {
      id: "s1",
      title: "Lecture",
      createdAt: "2026-07-21",
      questions: [],
      answers: {},
      grades: {},
      chat: {},
      source: EMPTY_SOURCE,
    });
    expect(addSession(first, { ...first[0], title: "Updated" })).toEqual([
      expect.objectContaining({ title: "Updated" }),
    ]);
  });
  it("ignores corrupt saved sessions", () => expect(readSessions("bad json")).toEqual([]));
  it("groups sessions by local calendar day and calculates graded accuracy", () => {
    const session: StudySession = {
      id: "s1",
      title: "Lecture",
      createdAt: "2026-07-21T12:00:00",
      questions: [],
      answers: {},
      grades: {
        q1: { status: "correct", score: 1, feedback: "Good", missingPoints: [] },
        q2: { status: "incorrect", score: 0, feedback: "Review", missingPoints: [] },
      },
      chat: {},
      source: EMPTY_SOURCE,
    };
    expect(groupSessionsByDate([session])["2026-07-21"]).toHaveLength(1);
    expect(getSessionAccuracy(session)).toBe(50);
  });
});
