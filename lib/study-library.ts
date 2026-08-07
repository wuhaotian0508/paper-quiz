import { z } from "zod";
import { normalizeMaterialId } from "@/lib/study-history";
import {
  compareSubjects,
  inferSubject,
  MAX_SUBJECT_CHARS,
  normaliseSubject,
  UNASSIGNED_SUBJECT,
} from "@/lib/subject";

export const STUDY_LIBRARY_KEY = "paper-plane-quiz-library-v1";
export const STUDY_LIBRARY_UPDATED_EVENT = "paper-quiz-library-updated";
export const STUDY_MATERIAL_OPEN_EVENT = "paper-quiz-open-material";
const MAX_LIBRARY_ITEMS = 50;

/**
 * Courses the student created by hand, stored apart from the materials.
 *
 * A subject is otherwise only a field on a material, so a course with nothing filed under it
 * yet has nowhere to live and would vanish on reload. This list is what lets an empty folder
 * exist long enough to drag the first PDF into it.
 */
export const STUDY_SUBJECTS_KEY = "paper-plane-quiz-subjects-v1";
const MAX_SUBJECTS = 40;

export function readStudySubjects(value: string | null): string[] {
  try {
    const parsed: unknown = JSON.parse(value || "[]");
    if (!Array.isArray(parsed)) return [];
    const named = parsed
      .filter((item): item is string => typeof item === "string")
      .map(normaliseSubject)
      .filter((subject) => subject !== UNASSIGNED_SUBJECT);
    return [...new Set(named)].slice(0, MAX_SUBJECTS);
  } catch {
    return [];
  }
}

/** Returns the same array when the course already exists, so callers can skip the write. */
export function addStudySubject(subjects: readonly string[], name: string): string[] {
  const subject = normaliseSubject(name);
  if (!subject || subjects.some((item) => normaliseSubject(item) === subject))
    return subjects as string[];
  return [...subjects, subject].slice(0, MAX_SUBJECTS);
}

export function renameStudySubject(
  subjects: readonly string[],
  from: string,
  to: string,
): string[] {
  const source = normaliseSubject(from);
  const target = normaliseSubject(to);
  if (!target || source === target) return subjects as string[];
  const renamed = subjects.map((item) => (normaliseSubject(item) === source ? target : item));
  // Renaming onto an existing course merges the folders, so the name must not appear twice.
  return [...new Set(renamed)];
}

export function removeStudySubject(subjects: readonly string[], name: string): string[] {
  const subject = normaliseSubject(name);
  return subjects.filter((item) => normaliseSubject(item) !== subject);
}

/**
 * Every folder the sidebar shows: the courses materials are filed under, plus the created
 * ones still standing empty. Ordering stays with `groupBySubject` so an empty course sorts
 * among the rest rather than being appended after them.
 */
export function libraryFolders<T>(
  grouped: { subject: string; items: T[] }[],
  subjects: readonly string[],
): { subject: string; items: T[] }[] {
  const seen = new Set(grouped.map((group) => normaliseSubject(group.subject)));
  const empty = subjects
    .map(normaliseSubject)
    .filter((subject) => subject && !seen.has(subject))
    .map((subject) => ({ subject, items: [] as T[] }));
  return [...grouped, ...empty].sort((left, right) => compareSubjects(left.subject, right.subject));
}

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
    const records = parsed.flatMap((item) => {
      const result = LibraryRecordSchema.safeParse(item);
      if (!result.success) return [];
      const record = migrateSubject(result.data);
      return [{ ...record, id: normalizeMaterialId(record.id) }];
    });
    return mergeDuplicateMaterials(records).slice(0, MAX_LIBRARY_ITEMS);
  } catch {
    return [];
  }
}

/**
 * Collapses the several records one PDF used to get, one per byte size it was ever saved at.
 *
 * The most recently touched copy wins, but an assigned subject is kept from whichever copy
 * has one: the duplicate a student happened to file under a course is usually not the
 * duplicate they opened last, and losing that would undo their filing.
 */
function mergeDuplicateMaterials(records: StudyLibraryRecord[]): StudyLibraryRecord[] {
  const byId = new Map<string, StudyLibraryRecord>();
  for (const record of records) {
    const existing = byId.get(record.id);
    if (!existing) {
      byId.set(record.id, record);
      continue;
    }
    const newest = libraryDate(record) > libraryDate(existing) ? record : existing;
    const oldest = newest === record ? existing : record;
    byId.set(record.id, {
      ...newest,
      subject: newest.subject || oldest.subject,
      uploadedAt: oldest.uploadedAt || newest.uploadedAt,
    });
  }
  return [...byId.values()];
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

/**
 * Renames a course everywhere it appears. Renaming onto a name already in use merges the
 * two folders, which is what dropping one course's name onto another visibly means.
 *
 * An empty `to` unassigns instead, so rename and "remove this folder" are the same
 * operation with different arguments.
 */
export function renameLibrarySubject(
  records: StudyLibraryRecord[],
  from: string,
  to: string,
  now: Date = new Date(),
): StudyLibraryRecord[] {
  const source = normaliseSubject(from);
  const target = normaliseSubject(to);
  if (source === target) return records;
  return records.map((record) =>
    normaliseSubject(record.subject) === source
      ? { ...record, subject: target, updatedAt: now.toISOString() }
      : record,
  );
}

/**
 * Removes a course, leaving its materials unassigned.
 *
 * Deliberately keeps the PDFs: the folder is a label the student applied, and a sidebar
 * gesture that silently discarded uploaded material along with it would be unrecoverable.
 */
export function removeLibrarySubject(
  records: StudyLibraryRecord[],
  subject: string,
  now: Date = new Date(),
): StudyLibraryRecord[] {
  return renameLibrarySubject(records, subject, UNASSIGNED_SUBJECT, now);
}

/** Every course currently in use, for the subject picker. */
export function listSubjects(records: readonly StudyLibraryRecord[]): string[] {
  const subjects = new Set(
    records.map((record) => record.subject).filter((subject) => subject !== UNASSIGNED_SUBJECT),
  );
  return [...subjects].sort((left, right) => left.localeCompare(right));
}

/** Maps material id to subject, for grouping sessions and mistakes that only carry a material id. */
export function subjectsByMaterial(records: readonly StudyLibraryRecord[]): Map<string, string> {
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
