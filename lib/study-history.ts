import type { GradeResult, Question } from "@/lib/quiz";
import { z } from "zod";

/**
 * Transcripts ride along with the session so a restored quiz can still grade written
 * answers. Capped well under the request limit because 30 sessions share one
 * localStorage quota; a transcript above the cap is dropped rather than truncated so
 * the model is never graded against half a lecture.
 */
export const MAX_PERSISTED_TRANSCRIPT_CHARS = 20_000;

/**
 * What a session needs to keep so grading and tutor chat still work after a reload.
 * A PDF cannot live in localStorage, so only the provider file id is kept.
 */
export type PersistedSource = { fileId: string | null; transcript: string };
export const EMPTY_SOURCE: PersistedSource = { fileId: null, transcript: "" };

export function boundSource(source: PersistedSource): PersistedSource {
  return {
    fileId: source.fileId || null,
    transcript: source.transcript.length <= MAX_PERSISTED_TRANSCRIPT_CHARS ? source.transcript : "",
  };
}

export function hasSource(source: PersistedSource | undefined): boolean {
  return Boolean(source && (source.fileId || source.transcript));
}

export type StudySession = {
  id: string;
  title: string;
  createdAt: string;
  questions: Question[];
  answers: Record<string, string>;
  grades: Record<string, GradeResult>;
  chat: Record<string, { role: "user" | "assistant"; content: string }[]>;
  source: PersistedSource;
};
export const STUDY_HISTORY_KEY = "paper-plane-quiz-history-v1";
const SourceSchema = z.object({
  fileId: z.string().nullable(),
  transcript: z.string().max(MAX_PERSISTED_TRANSCRIPT_CHARS),
});
const SessionSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  createdAt: z.string(),
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
