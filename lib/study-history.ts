import type { GradeResult, Question } from "@/lib/quiz";
import { z } from "zod";

/**
 * Transcripts ride along with the session so a restored quiz can still grade written
 * answers. Capped well under the request limit because 30 sessions share one
 * localStorage quota; a transcript above the cap is dropped rather than truncated so
 * the model is never graded against half a lecture.
 */
export const MAX_PERSISTED_TRANSCRIPT_CHARS = 20_000;

/** Longest study-material name kept; long enough for any real file name. */
export const MAX_MATERIAL_NAME_CHARS = 200;

/**
 * What a session needs to keep so grading and tutor chat still work after a reload.
 * A PDF cannot live in localStorage, so only the provider file id is kept.
 *
 * `materialId`/`materialName` identify *which upload* this came from, so questions and
 * mistakes can be grouped per PDF. The id is name + byte size rather than a content hash:
 * re-uploading the same file gives the same id, which is what grouping needs, and it stays
 * synchronous and testable. Renaming a file therefore starts a new group.
 */
export type PersistedSource = {
  fileId: string | null;
  fileIds?: string[];
  transcript: string;
  materialId: string;
  materialName: string;
};
export const EMPTY_SOURCE: PersistedSource = {
  fileId: null,
  fileIds: [],
  transcript: "",
  materialId: "",
  materialName: "",
};

export function materialFromFile(file: File): { materialId: string; materialName: string } {
  return { materialId: `${file.name}::${file.size}`, materialName: file.name };
}

const readString = (value: unknown) => (typeof value === "string" ? value : "");

/**
 * Also the migration boundary for data already in localStorage: the mistake book is read
 * without a schema, so every field has to be treated as possibly absent. Throwing here
 * would empty a user's saved book on upgrade.
 */
export function boundSource(source: Partial<PersistedSource> | null | undefined): PersistedSource {
  const transcript = readString(source?.transcript);
  return {
    fileId: source?.fileId || null,
    fileIds: Array.isArray(source?.fileIds)
      ? source.fileIds.filter((id): id is string => typeof id === "string").slice(0, 5)
      : undefined,
    transcript: transcript.length <= MAX_PERSISTED_TRANSCRIPT_CHARS ? transcript : "",
    materialId: readString(source?.materialId).slice(0, MAX_MATERIAL_NAME_CHARS + 32),
    materialName: readString(source?.materialName).slice(0, MAX_MATERIAL_NAME_CHARS),
  };
}

export function hasSource(source: PersistedSource | undefined): boolean {
  return Boolean(source && (source.fileId || source.fileIds?.length || source.transcript));
}

export type StudySession = {
  id: string;
  title: string;
  createdAt: string;
  /** Updated whenever a saved practice set changes, so offline edits win a later sync merge. */
  updatedAt?: string;
  questions: Question[];
  answers: Record<string, string>;
  grades: Record<string, GradeResult>;
  chat: Record<string, { role: "user" | "assistant"; content: string }[]>;
  source: PersistedSource;
};
export const STUDY_HISTORY_KEY = "paper-plane-quiz-history-v1";
const SourceSchema = z.object({
  fileId: z.string().nullable(),
  fileIds: z.array(z.string()).max(5).default([]),
  transcript: z.string().max(MAX_PERSISTED_TRANSCRIPT_CHARS),
  // Sources saved before per-material grouping existed have no material recorded.
  materialId: z
    .string()
    .max(MAX_MATERIAL_NAME_CHARS + 32)
    .default(""),
  materialName: z.string().max(MAX_MATERIAL_NAME_CHARS).default(""),
});
const SessionSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  createdAt: z.string(),
  updatedAt: z.string().optional(),
  questions: z.array(z.unknown()),
  answers: z.record(z.string()),
  grades: z.record(z.unknown()),
  chat: z
    .record(
      z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(2000) })),
    )
    .default({}),
  // Sessions written before source tracking existed still load, without a source.
  source: SourceSchema.default(EMPTY_SOURCE),
});
export function readSessions(value: string | null): StudySession[] {
  try {
    const data: unknown = JSON.parse(value || "[]");
    if (!Array.isArray(data)) return [];
    return data.flatMap((item) => {
      const parsed = SessionSchema.safeParse(item);
      return parsed.success ? [parsed.data as StudySession] : [];
    });
  } catch {
    return [];
  }
}
export function addSession(sessions: StudySession[], session: StudySession): StudySession[] {
  return [session, ...sessions.filter((item) => item.id !== session.id)].slice(0, 30);
}
export function sessionDateKey(value: string) {
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function groupSessionsByDate(sessions: StudySession[]) {
  return sessions.reduce<Record<string, StudySession[]>>((groups, session) => {
    const key = sessionDateKey(session.createdAt);
    groups[key] = [...(groups[key] || []), session];
    return groups;
  }, {});
}
export function getSessionAccuracy(session: StudySession) {
  const grades = Object.values(session.grades);
  return grades.length
    ? Math.round(
        (grades.filter((grade) => grade.status === "correct").length / grades.length) * 100,
      )
    : 0;
}
