"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { MistakeBookEntry } from "@/lib/mistake-book";
import {
  getRemoteDeletionCandidates,
  mergeStudyRecords,
  toSyncMistakeBookEntry,
  toSyncStudyLibraryRecord,
  toSyncStudySession,
  type SyncRecord,
} from "@/lib/study-sync";
import { boundSource, type StudySession } from "@/lib/study-history";
import type { StudyLibraryRecord } from "@/lib/study-library";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

export type StudySyncStatus = "idle" | "syncing" | "synced" | "error";

type SyncUser = { id: string; email?: string | null };
type RemoteRow = { id: string; payload: object; updated_at: string };
type QueryResult<T> = Promise<{ data: T | null; error: Error | null }>;
type SyncRow = { user_id: string; id: string; payload: object; updated_at: string };
type Snapshot = { payload: string; updatedAt: string };

export type StudySyncClient = {
  auth: {
    getUser: () => Promise<{ data: { user: SyncUser | null } }>;
    signOut?: () => Promise<{ error: Error | null }>;
    onAuthStateChange?: (callback: (event: string, session: { user: SyncUser } | null) => void) => {
      data: { subscription: { unsubscribe: () => void } };
    };
  };
  from: (table: "paper_quiz_sessions" | "paper_quiz_mistakes" | "paper_quiz_library") => {
    select: (columns: string) => {
      eq: (column: string, value: string) => QueryResult<RemoteRow[]>;
    };
    upsert: (rows: SyncRow[], options: { onConflict: string }) => QueryResult<null>;
    delete: () => {
      eq: (
        column: string,
        value: string,
      ) => { in: (column: string, values: string[]) => QueryResult<null> };
    };
  };
};

type HydratedStudyState = {
  sessions: StudySession[];
  mistakes: MistakeBookEntry[];
  library: StudyLibraryRecord[];
};
type UseStudySyncOptions = {
  client?: StudySyncClient;
  ready: boolean;
  sessions: StudySession[];
  mistakes: MistakeBookEntry[];
  library: StudyLibraryRecord[];
  onHydrate: (state: HydratedStudyState) => void;
};

const SESSION_TABLE = "paper_quiz_sessions" as const;
const MISTAKE_TABLE = "paper_quiz_mistakes" as const;
const LIBRARY_TABLE = "paper_quiz_library" as const;

/**
 * Local storage is the offline source of truth. This hook only uploads records that are
 * new or changed from the most recently read remote snapshot, preventing stale tabs from
 * writing an unchanged copy over a newer device's edit.
 */
export function useStudySync({
  client,
  ready,
  sessions,
  mistakes,
  library,
  onHydrate,
}: UseStudySyncOptions) {
  const [resolvedClient, setResolvedClient] = useState<StudySyncClient | null>(client ?? null);
  const [user, setUser] = useState<SyncUser | null>(null);
  const [status, setStatus] = useState<StudySyncStatus>("idle");
  const [mutationVersion, setMutationVersion] = useState(0);
  const [hydrationToken, setHydrationToken] = useState(0);
  const [hydratedToken, setHydratedToken] = useState(-1);
  const hydrationTokenRef = useRef(0);
  const priorRenderedUserId = useRef<string | null>(null);
  const lastAuthenticatedUserId = useRef<string | null>(null);
  const shouldMergeLocal = useRef(true);
  const remoteMistakeIds = useRef(new Set<string>());
  const pendingMistakeDeletes = useRef(new Set<string>());
  const snapshots = useRef({
    sessions: new Map<string, Snapshot>(),
    mistakes: new Map<string, Snapshot>(),
    library: new Map<string, Snapshot>(),
  });
  const userId = user?.id;

  useEffect(() => {
    if (!ready) return;
    if (client) {
      setResolvedClient(client);
      return;
    }

    try {
      setResolvedClient(getSupabaseBrowserClient() as unknown as StudySyncClient);
    } catch {
      // Guests retain full local functionality until public Supabase settings exist.
      setResolvedClient(null);
    }
  }, [client, ready]);

  useEffect(() => {
    if (!ready || !resolvedClient) return;
    let active = true;

    void resolvedClient.auth
      .getUser()
      .then(({ data }) => {
        if (active) setUser(data.user);
      })
      .catch(() => {
        if (active) setStatus("error");
      });
    const subscription = resolvedClient.auth.onAuthStateChange?.((_event, session) => {
      if (!active) return;
      setUser(session?.user ?? null);
      if (!session) setStatus("idle");
    });

    return () => {
      active = false;
      subscription?.data.subscription.unsubscribe();
    };
  }, [ready, resolvedClient]);

  useEffect(() => {
    if (priorRenderedUserId.current === userId) return;
    priorRenderedUserId.current = userId ?? null;
    if (userId) {
      // A different authenticated account must never inherit this browser's prior account data.
      shouldMergeLocal.current =
        lastAuthenticatedUserId.current === null || lastAuthenticatedUserId.current === userId;
      lastAuthenticatedUserId.current = userId;
    }
    pendingMistakeDeletes.current.clear();
    remoteMistakeIds.current.clear();
    snapshots.current = { sessions: new Map(), mistakes: new Map(), library: new Map() };
    hydrationTokenRef.current += 1;
    setHydrationToken(hydrationTokenRef.current);
  }, [userId]);

  useEffect(() => {
    if (
      !ready ||
      !resolvedClient ||
      !user ||
      hydrationToken !== hydrationTokenRef.current ||
      hydratedToken === hydrationToken
    )
      return;
    const syncClient = resolvedClient;
    const syncUser = user;
    const mergeLocal = shouldMergeLocal.current;
    let active = true;

    async function hydrate() {
      setStatus("syncing");
      try {
        const [sessionResult, mistakeResult, libraryResult] = await Promise.all([
          syncClient.from(SESSION_TABLE).select("id,payload,updated_at").eq("user_id", syncUser.id),
          syncClient.from(MISTAKE_TABLE).select("id,payload,updated_at").eq("user_id", syncUser.id),
          syncClient.from(LIBRARY_TABLE).select("id,payload,updated_at").eq("user_id", syncUser.id),
        ]);
        if (!active) return;
        if (
          sessionResult.error ||
          mistakeResult.error ||
          libraryResult.error ||
          !sessionResult.data ||
          !mistakeResult.data ||
          !libraryResult.data
        ) {
          setStatus("error");
          return;
        }

        const remoteSessions = sessionResult.data.map(toRemoteSession);
        const remoteMistakes = mistakeResult.data.map(toRemoteMistake);
        const remoteLibrary = libraryResult.data.map(toRemoteLibraryRecord);
        // Keep snapshots of what was actually read remotely, not the merged output.
        snapshots.current.sessions = new Map(
          remoteSessions.map((record) => [
            record.id,
            { payload: serialiseSession(record), updatedAt: record.updatedAt },
          ]),
        );
        snapshots.current.mistakes = new Map(
          remoteMistakes.map((record) => [
            record.id,
            { payload: serialiseMistake(record), updatedAt: record.updatedAt },
          ]),
        );
        snapshots.current.library = new Map(
          remoteLibrary.map((record) => [
            record.id,
            { payload: serialiseLibraryRecord(record), updatedAt: record.updatedAt },
          ]),
        );
        remoteMistakeIds.current = new Set(mistakeResult.data.map((row) => row.id));

        const nextSessions = mergeLocal
          ? mergeStudyRecords(sessions.map(toSyncStudySession), remoteSessions)
          : remoteSessions;
        const nextMistakes = mergeLocal
          ? mergeStudyRecords(mistakes.map(toSyncMistakeBookEntry), remoteMistakes)
          : remoteMistakes;
        const nextLibrary = mergeLocal
          ? mergeStudyRecords(library.map(toSyncStudyLibraryRecord), remoteLibrary)
          : remoteLibrary;
        onHydrate({ sessions: nextSessions, mistakes: nextMistakes, library: nextLibrary });
        setHydratedToken(hydrationToken);
      } catch {
        if (active) setStatus("error");
      }
    }

    void hydrate();
    return () => {
      active = false;
    };
  }, [
    hydratedToken,
    hydrationToken,
    library,
    mistakes,
    onHydrate,
    ready,
    resolvedClient,
    sessions,
    user,
  ]);

  useEffect(() => {
    if (!ready || !resolvedClient || !user || hydratedToken !== hydrationToken) return;
    const syncClient = resolvedClient;
    const syncUser = user;
    let active = true;
    const timeout = window.setTimeout(() => {
      void sync();
    }, 600);

    async function sync() {
      if (!active) return;
      setStatus("syncing");
      const sessionRows = sessions
        .map((session) =>
          toChangedRow(syncUser.id, session, snapshots.current.sessions, serialiseSession),
        )
        .filter((row): row is SyncRow => row !== null);
      const mistakeRows = mistakes
        .map((mistake) =>
          toChangedRow(syncUser.id, mistake, snapshots.current.mistakes, serialiseMistake),
        )
        .filter((row): row is SyncRow => row !== null);
      const libraryRows = library
        .map((record) =>
          toChangedRow(
            syncUser.id,
            toSyncStudyLibraryRecord(record),
            snapshots.current.library,
            serialiseLibraryRecord,
          ),
        )
        .filter((row): row is SyncRow => row !== null);
      // Re-adding an entry before the debounce expires cancels its earlier user deletion.
      for (const mistake of mistakes) pendingMistakeDeletes.current.delete(mistake.id);
      const explicitDeletes = getRemoteDeletionCandidates(
        remoteMistakeIds.current,
        pendingMistakeDeletes.current,
      );

      try {
        const operations: QueryResult<null>[] = [];
        if (sessionRows.length)
          operations.push(
            syncClient.from(SESSION_TABLE).upsert(sessionRows, { onConflict: "user_id,id" }),
          );
        if (mistakeRows.length)
          operations.push(
            syncClient.from(MISTAKE_TABLE).upsert(mistakeRows, { onConflict: "user_id,id" }),
          );
        if (libraryRows.length)
          operations.push(
            syncClient.from(LIBRARY_TABLE).upsert(libraryRows, { onConflict: "user_id,id" }),
          );
        if (explicitDeletes.length)
          operations.push(
            syncClient
              .from(MISTAKE_TABLE)
              .delete()
              .eq("user_id", syncUser.id)
              .in("id", explicitDeletes),
          );

        const results = await Promise.all(operations);
        if (!active) return;
        if (results.some((result) => result.error)) {
          setStatus("error");
          return;
        }

        for (const row of sessionRows)
          snapshots.current.sessions.set(row.id, {
            payload: JSON.stringify(row.payload),
            updatedAt: row.updated_at,
          });
        for (const row of mistakeRows) {
          snapshots.current.mistakes.set(row.id, {
            payload: JSON.stringify(row.payload),
            updatedAt: row.updated_at,
          });
          remoteMistakeIds.current.add(row.id);
        }
        for (const row of libraryRows)
          snapshots.current.library.set(row.id, {
            payload: JSON.stringify(row.payload),
            updatedAt: row.updated_at,
          });
        for (const id of explicitDeletes) {
          pendingMistakeDeletes.current.delete(id);
          remoteMistakeIds.current.delete(id);
        }
        setStatus("synced");
      } catch {
        if (active) setStatus("error");
      }
    }

    return () => {
      active = false;
      window.clearTimeout(timeout);
    };
  }, [
    hydratedToken,
    hydrationToken,
    library,
    mistakes,
    mutationVersion,
    ready,
    resolvedClient,
    sessions,
    user,
  ]);

  const requestMistakeDeletion = useCallback((ids: readonly string[]) => {
    for (const id of ids) pendingMistakeDeletes.current.add(id);
    setMutationVersion((version) => version + 1);
  }, []);

  const refresh = useCallback(() => {
    if (!user) return;
    hydrationTokenRef.current += 1;
    setHydrationToken(hydrationTokenRef.current);
  }, [user]);

  const signOut = useCallback(async () => {
    if (!resolvedClient?.auth.signOut) return;
    try {
      const { error } = await resolvedClient.auth.signOut();
      if (error) {
        setStatus("error");
        return;
      }
      setUser(null);
      setStatus("idle");
    } catch {
      setStatus("error");
    }
  }, [resolvedClient]);

  return { user, status, refresh, requestMistakeDeletion, signOut };
}

function withoutDeviceFileReferences(source: StudySession["source"]) {
  const { fileIds: _fileIds, ...portableSource } = boundSource(source);
  return { ...portableSource, fileId: null };
}

function toRemoteSession(row: RemoteRow): SyncRecord<StudySession> {
  const session = row.payload as StudySession;
  return {
    ...session,
    id: row.id,
    updatedAt: row.updated_at,
    // Provider file ids refer to an upload on another device and cannot be reused here.
    source: withoutDeviceFileReferences(session.source),
  };
}

function toRemoteMistake(row: RemoteRow): SyncRecord<MistakeBookEntry> {
  const mistake = row.payload as MistakeBookEntry;
  return {
    ...mistake,
    id: row.id,
    updatedAt: row.updated_at,
    source: withoutDeviceFileReferences(mistake.source),
  };
}

function toRemoteLibraryRecord(row: RemoteRow): SyncRecord<StudyLibraryRecord> {
  const record = row.payload as StudyLibraryRecord;
  return { ...record, id: row.id, updatedAt: row.updated_at };
}

/**
 * Library records hold no device-bound file references, so unlike sessions and mistakes
 * they travel whole.
 */
function serialiseLibraryRecord(record: SyncRecord<StudyLibraryRecord>) {
  return JSON.stringify(record);
}

function serialiseSession(session: StudySession | SyncRecord<StudySession>) {
  return JSON.stringify({
    ...session,
    // Never send device-bound OpenAI file ids to the shared study record.
    source: withoutDeviceFileReferences(session.source),
  });
}

function serialiseMistake(mistake: MistakeBookEntry | SyncRecord<MistakeBookEntry>) {
  return JSON.stringify({
    ...mistake,
    // A mistake can also contain source metadata, so it follows the same device boundary.
    source: withoutDeviceFileReferences(mistake.source),
  });
}

function toChangedRow<T extends { id: string }>(
  userId: string,
  record: T,
  known: Map<string, Snapshot>,
  serialise: (record: T) => string,
): SyncRow | null {
  const payload = serialise(record);
  const previous = known.get(record.id);
  if (previous?.payload === payload) return null;
  return {
    user_id: userId,
    id: record.id,
    payload: JSON.parse(payload) as object,
    updated_at: new Date().toISOString(),
  };
}
