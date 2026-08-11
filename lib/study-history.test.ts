import { describe, expect, it } from "vitest";
import {
  addSession,
  getSessionAccuracy,
  groupSessionsByDate,
  EMPTY_SOURCE,
  materialFromNotes,
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
  it("preserves an optional update timestamp so offline edits win later sync merges", () => {
    expect(
      readSessions(
        JSON.stringify([
          {
            id: "s1",
            title: "Lecture",
            createdAt: "2026-07-21T10:00:00.000Z",
            updatedAt: "2026-07-22T10:00:00.000Z",
            questions: [],
            answers: {},
            grades: {},
            chat: {},
            source: EMPTY_SOURCE,
          },
        ]),
      )[0],
    ).toMatchObject({ updatedAt: "2026-07-22T10:00:00.000Z" });
  });
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

describe("materialFromNotes", () => {
  it("names pasted notes after their first line, so two lectures do not merge", () => {
    expect(materialFromNotes("Week 3 — Bayes rule\nP(A|B) = ...", "Lecture notes")).toEqual({
      materialId: "Week 3 — Bayes rule",
      materialName: "Week 3 — Bayes rule",
    });
  });

  it("falls back to the supplied label when the notes open with blank lines", () => {
    expect(materialFromNotes("\n\n   \n", "Lecture notes")).toEqual({
      materialId: "Lecture notes",
      materialName: "Lecture notes",
    });
  });

  it("caps a runaway first line so it stays usable as a library entry", () => {
    expect(materialFromNotes("x".repeat(200), "Lecture notes").materialName).toHaveLength(60);
  });
});
