import type { MistakeBookEntry } from "./mistake-book";
import type { StudySession } from "./study-history";
import type { StudyLibraryRecord } from "./study-library";

export type SyncRecord<T extends object = object> = T & {
  id: string;
  updatedAt: string;
};

export type SyncableStudySession = StudySession & { updatedAt?: string };
export type ExplicitlyDeletedIds = ReadonlySet<string>;

/**
 * Gives sessions written before sync a common timestamp shape without changing the
 * local history schema. Those legacy records have only their creation time.
 */
export function toSyncStudySession(session: SyncableStudySession): SyncRecord<StudySession> {
  return { ...session, updatedAt: session.updatedAt || session.createdAt };
}

export function toSyncMistakeBookEntry(entry: MistakeBookEntry): SyncRecord<MistakeBookEntry> {
  return entry;
}

/**
 * Library records written before subjects existed have no `updatedAt`. Falling back to when
 * the material was last opened, then to its upload time, gives the merge a real ordering
 * instead of letting every legacy record tie at the empty string.
 */
export function toSyncStudyLibraryRecord(
  record: StudyLibraryRecord,
): SyncRecord<StudyLibraryRecord> {
  return { ...record, updatedAt: record.updatedAt || record.lastOpenedAt || record.uploadedAt };
}

/**
 * Merges offline and remote copies without mutating either source. Equal timestamps
 * retain the local copy, so a repeat merge has a stable result.
 */
export function mergeStudyRecords<T extends SyncRecord>(
  local: readonly T[],
  remote: readonly T[],
): T[] {
  const byId = new Map<string, T>();

  for (const record of [...local, ...remote]) {
    const current = byId.get(record.id);
    if (!current || compareUpdatedAt(record.updatedAt, current.updatedAt) > 0) {
      byId.set(record.id, record);
    }
  }

  return [...byId.values()].sort(compareNewestFirst);
}

/**
 * Determines which remote rows an explicit local delete action may remove. An
 * undefined prior set marks the initial authenticated merge, when no deletion can
 * be inferred; local collection changes are deliberately not an input here.
 */
export function getRemoteDeletionCandidates(
  previouslySyncedRemoteIds: ReadonlySet<string> | undefined,
  explicitlyDeletedIds: ExplicitlyDeletedIds | undefined,
): string[] {
  if (!previouslySyncedRemoteIds || !explicitlyDeletedIds) return [];

  return [...explicitlyDeletedIds].filter((id) => previouslySyncedRemoteIds.has(id)).sort();
}

function compareNewestFirst(left: SyncRecord, right: SyncRecord): number {
  const timestampOrder = compareUpdatedAt(right.updatedAt, left.updatedAt);
  if (timestampOrder !== 0) return timestampOrder;
  if (left.id === right.id) return 0;
  return left.id < right.id ? -1 : 1;
}

function compareUpdatedAt(left: string, right: string): number {
  const leftTime = Date.parse(left);
  const rightTime = Date.parse(right);

  if (!Number.isNaN(leftTime) && !Number.isNaN(rightTime)) {
    if (leftTime === rightTime) return 0;
    return leftTime > rightTime ? 1 : -1;
  }

  // Invalid timestamps still merge and sort predictably without inventing a date.
  if (left === right) return 0;
  return left > right ? 1 : -1;
}
