import { describe, expect, it } from "vitest";
import {
  getRemoteDeletionCandidates,
  mergeStudyRecords,
  toSyncMistakeBookEntry,
  toSyncStudySession,
  type SyncRecord,
} from "./study-sync";
import type { MistakeBookEntry } from "./mistake-book";
import { EMPTY_SOURCE, type StudySession } from "./study-history";

type TestRecord = SyncRecord<{ value: string }>;

const record = (id: string, updatedAt: string, value = id): TestRecord => ({
  id,
  updatedAt,
  value,
});

describe("mergeStudyRecords", () => {
  it("keeps the newer remote record for the same id", () => {
    expect(
      mergeStudyRecords(
        [record("s1", "2026-07-28T10:00:00.000Z", "local")],
        [record("s1", "2026-07-28T11:00:00.000Z", "remote")],
      ),
    ).toEqual([record("s1", "2026-07-28T11:00:00.000Z", "remote")]);
  });

  it("compares ISO timestamps chronologically across offsets", () => {
    expect(
      mergeStudyRecords(
        [record("s1", "2026-07-28T10:30:00.000+01:00", "local")],
        [record("s1", "2026-07-28T09:45:00.000Z", "remote")],
      ),
    ).toEqual([record("s1", "2026-07-28T09:45:00.000Z", "remote")]);
  });

  it("retains the local copy when offset timestamps describe the same instant", () => {
    expect(
      mergeStudyRecords(
        [record("s1", "2026-07-28T10:00:00.000Z", "local")],
        [record("s1", "2026-07-28T03:00:00.000-07:00", "remote")],
      ),
    ).toEqual([record("s1", "2026-07-28T10:00:00.000Z", "local")]);
  });

  it("keeps the newer local record for the same id", () => {
    expect(
      mergeStudyRecords(
        [record("s1", "2026-07-28T11:00:00.000Z", "local")],
        [record("s1", "2026-07-28T10:00:00.000Z", "remote")],
      ),
    ).toEqual([record("s1", "2026-07-28T11:00:00.000Z", "local")]);
  });

  it("preserves records that exist on only one side and orders newest first", () => {
    expect(
      mergeStudyRecords(
        [record("local", "2026-07-28T10:00:00.000Z")],
        [record("remote", "2026-07-28T11:00:00.000Z")],
      ),
    ).toEqual([
      record("remote", "2026-07-28T11:00:00.000Z"),
      record("local", "2026-07-28T10:00:00.000Z"),
    ]);
  });

  it("retains the local copy for equal timestamps and orders equal-time records by id", () => {
    const timestamp = "2026-07-28T10:00:00.000Z";

    expect(
      mergeStudyRecords(
        [record("b", timestamp, "local"), record("a", timestamp, "local-a")],
        [record("b", timestamp, "remote"), record("c", timestamp, "remote-c")],
      ),
    ).toEqual([
      record("a", timestamp, "local-a"),
      record("b", timestamp, "local"),
      record("c", timestamp, "remote-c"),
    ]);
  });

  it("does not produce remote deletion candidates before the first authenticated merge", () => {
    expect(getRemoteDeletionCandidates(undefined, new Set(["delete-me"]))).toEqual([]);
  });

  it("does not treat a locally evicted record as deleted without an explicit deletion event", () => {
    expect(getRemoteDeletionCandidates(new Set(["evicted-by-limit"]), undefined)).toEqual([]);
  });

  it("returns only explicit deletions that were previously synced remotely", () => {
    expect(
      getRemoteDeletionCandidates(
        new Set(["keep", "delete-b", "delete-a"]),
        new Set(["delete-b", "delete-a", "never-remote"]),
      ),
    ).toEqual(["delete-a", "delete-b"]);
  });

  it("uses a legacy session's createdAt when it has no update timestamp", () => {
    const session: StudySession = {
      id: "session-1",
      title: "Legacy lecture",
      createdAt: "2026-07-27T10:00:00.000Z",
      questions: [],
      answers: {},
      grades: {},
      chat: {},
      source: EMPTY_SOURCE,
    };

    expect(toSyncStudySession(session)).toMatchObject({
      id: "session-1",
      updatedAt: "2026-07-27T10:00:00.000Z",
    });
  });

  it("retains an existing session update timestamp", () => {
    const session: StudySession & { updatedAt: string } = {
      id: "session-1",
      title: "Updated lecture",
      createdAt: "2026-07-27T10:00:00.000Z",
      updatedAt: "2026-07-28T10:00:00.000Z",
      questions: [],
      answers: {},
      grades: {},
      chat: {},
      source: EMPTY_SOURCE,
    };

    expect(toSyncStudySession(session).updatedAt).toBe("2026-07-28T10:00:00.000Z");
  });

  it("preserves a mistake book entry's update timestamp", () => {
    const mistake = {
      id: "mistake-1",
      updatedAt: "2026-07-28T10:00:00.000Z",
    } as MistakeBookEntry;

    expect(toSyncMistakeBookEntry(mistake)).toMatchObject({
      id: "mistake-1",
      updatedAt: "2026-07-28T10:00:00.000Z",
    });
  });
});
