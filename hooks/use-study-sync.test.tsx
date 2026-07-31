import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MistakeBookEntry } from "@/lib/mistake-book";
import { useStudySync } from "./use-study-sync";

type RemoteRow = { id: string; payload: object; updated_at: string };

function fakeClient(
  rows: { sessions?: RemoteRow[]; mistakes?: RemoteRow[] } = {},
  initialUserId = "user-1",
) {
  let authCallback: ((event: string, session: { user: { id: string } } | null) => void) | undefined;
  const select = vi.fn((table: "paper_quiz_sessions" | "paper_quiz_mistakes") => ({
    eq: vi.fn().mockResolvedValue({
      data: table === "paper_quiz_sessions" ? (rows.sessions ?? []) : (rows.mistakes ?? []),
      error: null,
    }),
  }));
  const upsert = vi.fn().mockResolvedValue({ error: null });
  const remove = vi.fn(() => ({
    eq: vi.fn(() => ({ in: vi.fn().mockResolvedValue({ error: null }) })),
  }));

  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: initialUserId } } }),
      onAuthStateChange: vi.fn((callback) => {
        authCallback = callback;
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      }),
    },
    from: vi.fn((table: "paper_quiz_sessions" | "paper_quiz_mistakes") => ({
      select: () => select(table),
      upsert,
      delete: remove,
    })),
    select,
    upsert,
    remove,
    emitAuth(userId: string | null) {
      authCallback?.(userId ? "SIGNED_IN" : "SIGNED_OUT", userId ? { user: { id: userId } } : null);
    },
  };
}

const localSession = {
  id: "local",
  title: "Local practice",
  createdAt: "2026-07-27T10:00:00.000Z",
  questions: [],
  answers: {},
  grades: {},
  chat: {},
  source: { fileId: null, transcript: "", materialId: "", materialName: "" },
};

describe("useStudySync", () => {
  afterEach(() => {
    // Cancel React effects while fake timers still own their scheduled callbacks.
    cleanup();
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("does not contact Supabase before browser storage has loaded", async () => {
    const client = fakeClient();
    renderHook(() =>
      useStudySync({
        client: client as never,
        ready: false,
        sessions: [localSession],
        mistakes: [],
        onHydrate: vi.fn(),
      }),
    );

    await Promise.resolve();
    expect(client.auth.getUser).not.toHaveBeenCalled();
    expect(client.from).not.toHaveBeenCalled();
  });

  it("merges remote records with local records once an authenticated user loads", async () => {
    const remoteSession = { ...localSession, id: "remote", createdAt: "2026-07-28T10:00:00.000Z" };
    const client = fakeClient({
      sessions: [{ id: "remote", payload: remoteSession, updated_at: remoteSession.createdAt }],
    });
    const onHydrate = vi.fn();

    renderHook(() =>
      useStudySync({
        client: client as never,
        ready: true,
        sessions: [localSession],
        mistakes: [],
        onHydrate,
      }),
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(onHydrate).toHaveBeenCalledTimes(1);
    expect(onHydrate.mock.calls[0][0].sessions.map((item: { id: string }) => item.id)).toEqual([
      "remote",
      "local",
    ]);
  });

  it("keeps local state untouched when the initial remote read fails", async () => {
    const client = fakeClient();
    client.select.mockReturnValue({
      eq: vi.fn().mockResolvedValue({ data: null, error: new Error("offline") }),
    });
    const onHydrate = vi.fn();
    const { result } = renderHook(() =>
      useStudySync({
        client: client as never,
        ready: true,
        sessions: [localSession],
        mistakes: [],
        onHydrate,
      }),
    );

    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(onHydrate).not.toHaveBeenCalled();
  });

  it("deletes an explicitly removed remote mistake only after the initial merge", async () => {
    vi.useFakeTimers();
    const remoteMistake: MistakeBookEntry = {
      id: "removed",
      version: 1,
      question: {
        id: "q1",
        type: "fill_blank",
        prompt: "A ____",
        acceptedAnswers: ["B"],
        referenceAnswer: "B",
        explanation: "B",
        sourceNote: "Lecture",
      },
      answer: "C",
      status: "incorrect",
      score: 0,
      feedback: "Try again",
      missingPoints: ["B"],
      updatedAt: "2026-07-28T10:00:00.000Z",
      source: {
        fileId: "file-local-device",
        transcript: "Lecture transcript",
        materialId: "lecture::42",
        materialName: "lecture.pdf",
      },
    };
    const client = fakeClient({
      mistakes: [{ id: "removed", payload: remoteMistake, updated_at: remoteMistake.updatedAt }],
    });
    const onHydrate = vi.fn();
    const { result, rerender } = renderHook(
      ({ mistakes }) =>
        useStudySync({ client: client as never, ready: true, sessions: [], mistakes, onHydrate }),
      { initialProps: { mistakes: [remoteMistake] } },
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(onHydrate).toHaveBeenCalledTimes(1);
    rerender({ mistakes: [] });
    act(() => result.current.requestMistakeDeletion(["removed"]));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });

    expect(client.remove).toHaveBeenCalled();
  });

  it("cancels a queued delete when the student recreates that mistake before sync", async () => {
    vi.useFakeTimers();
    const mistake: MistakeBookEntry = {
      id: "recreated",
      version: 1,
      question: {
        id: "q1",
        type: "fill_blank" as const,
        prompt: "A ____",
        acceptedAnswers: ["B"],
        referenceAnswer: "B",
        explanation: "B",
        sourceNote: "Lecture",
      },
      answer: "C",
      status: "incorrect" as const,
      score: 0,
      feedback: "Try again",
      missingPoints: ["B"],
      updatedAt: "2026-07-28T10:00:00.000Z",
      source: {
        fileId: "file-local-device",
        transcript: "Lecture transcript",
        materialId: "lecture::42",
        materialName: "lecture.pdf",
      },
    };
    const client = fakeClient({
      mistakes: [{ id: mistake.id, payload: mistake, updated_at: mistake.updatedAt }],
    });
    const { result, rerender } = renderHook(
      ({ mistakes }) =>
        useStudySync({
          client: client as never,
          ready: true,
          sessions: [],
          mistakes,
          onHydrate: vi.fn(),
        }),
      { initialProps: { mistakes: [mistake] } },
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    rerender({ mistakes: [] });
    act(() => result.current.requestMistakeDeletion([mistake.id]));
    rerender({ mistakes: [mistake] });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });

    expect(client.remove).not.toHaveBeenCalled();
  });

  it("deletes a mistake that was created locally after its successful cloud upsert", async () => {
    vi.useFakeTimers();
    const createdMistake: MistakeBookEntry = {
      id: "created-locally",
      version: 1,
      question: {
        id: "q1",
        type: "fill_blank",
        prompt: "A ____",
        acceptedAnswers: ["B"],
        referenceAnswer: "B",
        explanation: "B",
        sourceNote: "Lecture",
      },
      answer: "C",
      status: "incorrect",
      score: 0,
      feedback: "Try again",
      missingPoints: ["B"],
      updatedAt: "2026-07-28T10:00:00.000Z",
      source: {
        fileId: "file-local-device",
        transcript: "Lecture transcript",
        materialId: "lecture::42",
        materialName: "lecture.pdf",
      },
    };
    const client = fakeClient();
    const { result, rerender } = renderHook(
      ({ mistakes }) =>
        useStudySync({
          client: client as never,
          ready: true,
          sessions: [],
          mistakes,
          onHydrate: vi.fn(),
        }),
      { initialProps: { mistakes: [] as MistakeBookEntry[] } },
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    rerender({ mistakes: [createdMistake] });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });
    expect(client.upsert.mock.calls[0][0][0].payload).toMatchObject({
      source: {
        fileId: null,
        transcript: "Lecture transcript",
        materialId: "lecture::42",
        materialName: "lecture.pdf",
      },
    });

    rerender({ mistakes: [] });
    act(() => result.current.requestMistakeDeletion([createdMistake.id]));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });

    expect(client.remove).toHaveBeenCalled();
  });

  it("never merges the previous account's local study data into a different account", async () => {
    const client = fakeClient({}, "user-a");
    const onHydrate = vi.fn();
    renderHook(() =>
      useStudySync({
        client: client as never,
        ready: true,
        sessions: [localSession],
        mistakes: [],
        onHydrate,
      }),
    );

    await waitFor(() => expect(onHydrate).toHaveBeenCalledTimes(1));
    act(() => client.emitAuth(null));
    act(() => client.emitAuth("user-b"));

    await waitFor(() => expect(onHydrate).toHaveBeenCalledTimes(2));
    expect(onHydrate.mock.calls[1][0].sessions).toEqual([]);
  });

  it("refetches remote records when the same user signs out and returns", async () => {
    const client = fakeClient({}, "user-a");
    const onHydrate = vi.fn();
    renderHook(() =>
      useStudySync({
        client: client as never,
        ready: true,
        sessions: [],
        mistakes: [],
        onHydrate,
      }),
    );

    await waitFor(() => expect(onHydrate).toHaveBeenCalledTimes(1));
    act(() => client.emitAuth(null));
    act(() => client.emitAuth("user-a"));

    await waitFor(() => expect(client.select.mock.calls.length).toBeGreaterThanOrEqual(4));
  });

  it("does not upsert an unchanged hydrated record and overwrite a later remote edit", async () => {
    vi.useFakeTimers();
    const remoteSession = {
      ...localSession,
      updatedAt: "2026-07-28T10:00:00.000Z",
      source: { ...localSession.source, fileId: "remote-device-file" },
    };
    const client = fakeClient({
      sessions: [
        { id: remoteSession.id, payload: remoteSession, updated_at: remoteSession.updatedAt },
      ],
    });
    const onHydrate = vi.fn();
    const { rerender } = renderHook(
      ({ sessions }) =>
        useStudySync({ client: client as never, ready: true, sessions, mistakes: [], onHydrate }),
      { initialProps: { sessions: [] as (typeof localSession)[] } },
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    rerender({ sessions: onHydrate.mock.calls[0][0].sessions });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });

    expect(client.upsert).not.toHaveBeenCalled();
  });

  it("removes a remote device file id before hydrating a restored session", async () => {
    const remoteSession = {
      ...localSession,
      source: { ...localSession.source, fileId: "file-from-another-device" },
    };
    const client = fakeClient({
      sessions: [
        { id: remoteSession.id, payload: remoteSession, updated_at: remoteSession.createdAt },
      ],
    });
    const onHydrate = vi.fn();
    renderHook(() =>
      useStudySync({ client: client as never, ready: true, sessions: [], mistakes: [], onHydrate }),
    );

    await waitFor(() => expect(onHydrate).toHaveBeenCalledTimes(1));
    expect(onHydrate.mock.calls[0][0].sessions[0].source.fileId).toBeNull();
  });

  it("removes a remote device file id before hydrating a restored mistake", async () => {
    const remoteMistake: MistakeBookEntry = {
      id: "remote-mistake",
      version: 1,
      question: {
        id: "q1",
        type: "fill_blank",
        prompt: "A ____",
        acceptedAnswers: ["B"],
        referenceAnswer: "B",
        explanation: "B",
        sourceNote: "Lecture",
      },
      answer: "C",
      status: "incorrect",
      score: 0,
      feedback: "Try again",
      missingPoints: ["B"],
      updatedAt: "2026-07-28T10:00:00.000Z",
      source: {
        fileId: "file-from-another-device",
        fileIds: ["file-from-another-device", "file-homework-from-another-device"],
        transcript: "Lecture transcript",
        materialId: "lecture::42",
        materialName: "lecture.pdf",
      },
    };
    const client = fakeClient({
      mistakes: [
        { id: remoteMistake.id, payload: remoteMistake, updated_at: remoteMistake.updatedAt },
      ],
    });
    const onHydrate = vi.fn();
    renderHook(() =>
      useStudySync({ client: client as never, ready: true, sessions: [], mistakes: [], onHydrate }),
    );

    await waitFor(() => expect(onHydrate).toHaveBeenCalledTimes(1));
    expect(onHydrate.mock.calls[0][0].mistakes[0].source).toEqual({
      fileId: null,
      transcript: "Lecture transcript",
      materialId: "lecture::42",
      materialName: "lecture.pdf",
    });
  });

  it("reports a rejected remote read without changing local state", async () => {
    const client = fakeClient();
    client.select.mockReturnValue({ eq: vi.fn().mockRejectedValue(new Error("network down")) });
    const onHydrate = vi.fn();
    const { result } = renderHook(() =>
      useStudySync({
        client: client as never,
        ready: true,
        sessions: [localSession],
        mistakes: [],
        onHydrate,
      }),
    );

    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(onHydrate).not.toHaveBeenCalled();
  });
});
