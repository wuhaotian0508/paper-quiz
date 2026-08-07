import { z } from "zod";
import { inferSubject, MAX_SUBJECT_CHARS, normaliseSubject, UNASSIGNED_SUBJECT } from "@/lib/subject";

export const STUDY_LIBRARY_KEY = "paper-plane-quiz-library-v1";
export const STUDY_LIBRARY_UPDATED_EVENT = "paper-quiz-library-updated";
export const STUDY_MATERIAL_OPEN_EVENT = "paper-quiz-open-material";
const MAX_LIBRARY_ITEMS = 50;

export type StudyLibraryRecord = {
  id: string;
  name: string;
  uploadedAt: string;
  lastOpenedAt: string;
  /** Course this material belongs to. Empty means unassigned; see `lib/subject.ts`. */
  subject: string;
  /**
   * Last change to the record itself, which is what cross-device merging compares.
   * Distinct from `lastOpenedAt`: opening a PDF on a phone must not win over renaming
   * its subject on a laptop.
   */
  updatedAt: string;
};

const LibraryRecordSchema = z.object({
  id: z.string().min(1).max(240),
  name: z.string().min(1).max(200),
  uploadedAt: z.string(),
  lastOpenedAt: z.string(),
  // Defaulted, not required: zod strips unknown keys, so records written before subjects
  // existed would otherwise fail to parse and disappear from the library on upgrade.
  subject: z.string().max(MAX_SUBJECT_CHARS).default(UNASSIGNED_SUBJECT),
  updatedAt: z.string().default(""),
});

export function readStudyLibrary(value: string | null): StudyLibraryRecord[] {
  try {
    const parsed: unknown = JSON.parse(value || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed
      .flatMap((item) => {
        const result = LibraryRecordSchema.safeParse(item);
        return result.success ? [migrateSubject(result.data)] : [];
      })
      .slice(0, MAX_LIBRARY_ITEMS);
  } catch {
    return [];
  }
}

/**
 * One-time backfill for records written before subjects existed, so an established library
 * arrives already sorted into courses instead of one long unassigned pile.
 *
 * Keyed on the empty `updatedAt` that only pre-subject records have, *not* on an empty
 * subject: re-inferring whenever the subject is blank would silently undo a student who
 * deliberately cleared a wrong guess.
 */
function migrateSubject(record: StudyLibraryRecord): StudyLibraryRecord {
  if (record.updatedAt) return record;
  return {
    ...record,
    subject: inferSubject(record.name),
    updatedAt: record.lastOpenedAt || record.uploadedAt,
  };
}

/** A newly seen material, with its course guessed from the file name. */
export function createLibraryRecord(
  input: { id: string; name: string; uploadedAt?: string; lastOpenedAt?: string; subject?: string },
  now: Date = new Date(),
): StudyLibraryRecord {
  const timestamp = now.toISOString();
  return {
    id: input.id,
    name: input.name,
    uploadedAt: input.uploadedAt || timestamp,
    lastOpenedAt: input.lastOpenedAt || "",
    subject: normaliseSubject(input.subject ?? inferSubject(input.name)),
    updatedAt: timestamp,
  };
}

/**
 * Adds or updates a material. Fields absent from `record` keep the value already stored,
 * so the frequent "mark this as opened" write cannot wipe a subject the student assigned.
 */
export function upsertStudyLibrary(
  records: StudyLibraryRecord[],
  record: StudyLibraryRecord,
): StudyLibraryRecord[] {
  const existing = records.find((item) => item.id === record.id);
  const merged: StudyLibraryRecord = existing
    ? { ...existing, ...record, subject: record.subject || existing.subject }
    : record;
  const next = [merged, ...records.filter((item) => item.id !== record.id)];
  return next
    .sort((left, right) => libraryDate(right).localeCompare(libraryDate(left)))
    .slice(0, MAX_LIBRARY_ITEMS);
}

/** Assigns a course to a material. An empty subject deliberately means "unassign". */
export function setLibrarySubject(
  records: StudyLibraryRecord[],
  id: string,
  subject: string,
  now: Date = new Date(),
): StudyLibraryRecord[] {
  return records.map((record) =>
    record.id === id
      ? { ...record, subject: normaliseSubject(subject), updatedAt: now.toISOString() }
      : record,
  );
}

/** Every course currently in use, for the subject picker. */
export function listSubjects(records: readonly StudyLibraryRecord[]): string[] {
  const subjects = new Set(
    records.map((record) => record.subject).filter((subject) => subject !== UNASSIGNED_SUBJECT),
  );
  return [...subjects].sort((left, right) => left.localeCompare(right));
}

/** Maps material id to subject, for grouping sessions and mistakes that only carry a material id. */
export function subjectsByMaterial(
  records: readonly StudyLibraryRecord[],
): Map<string, string> {
  return new Map(records.map((record) => [record.id, record.subject]));
}

/**
 * When a material last mattered to the student: the moment they opened it, or failing that
 * the upload. Exported so the sidebar orders a course's files by the same rule the store
 * orders the whole library by, rather than growing a second, subtly different notion of
 * "most recent".
 */
export function libraryDate(record: StudyLibraryRecord) {
  return record.lastOpenedAt || record.uploadedAt;
}
