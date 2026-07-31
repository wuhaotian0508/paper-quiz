import { questionKey, type Question } from "@/lib/quiz";
import type { MistakeBookEntry } from "@/lib/mistake-book";
import type { StudySession } from "@/lib/study-history";

/** Practice saved before per-material grouping existed, plus anything with no file name. */
export const UNGROUPED_ID = "";
export const UNGROUPED_NAME = "Earlier practice (no source recorded)";

export type StudyMaterial = {
  id: string;
  name: string;
  /** Newest first. */
  sessions: StudySession[];
  /** Every distinct question ever generated from this material, newest quiz first. */
  questions: Question[];
  mistakes: MistakeBookEntry[];
  lastPracticedAt: string;
};

function displayName(id: string, recorded: string) {
  if (id === UNGROUPED_ID) return UNGROUPED_NAME;
  return recorded || id;
}

/**
 * Collects everything belonging to each uploaded PDF or recording.
 *
 * Questions are deduped by content because the same material re-quizzed will produce
 * overlapping questions, and because `question.id` restarts at q1 in every quiz.
 *
 * Only what is still in localStorage can be shown: sessions are capped at 30, so very old
 * quizzes are not recoverable here.
 */
export function groupStudyMaterials(
  sessions: StudySession[],
  mistakes: MistakeBookEntry[],
): StudyMaterial[] {
  const groups = new Map<string, StudyMaterial>();

  const ensure = (id: string, name: string): StudyMaterial => {
    const existing = groups.get(id);
    if (existing) {
      if (existing.name === UNGROUPED_NAME || existing.name === id) {
        existing.name = displayName(id, name);
      }
      return existing;
    }
    const created: StudyMaterial = {
      id,
      name: displayName(id, name),
      sessions: [],
      questions: [],
      mistakes: [],
      lastPracticedAt: "",
    };
    groups.set(id, created);
    return created;
  };

  for (const session of sessions) {
    const group = ensure(session.source.materialId, session.source.materialName);
    group.sessions.push(session);
    if (session.createdAt > group.lastPracticedAt) group.lastPracticedAt = session.createdAt;
  }

  for (const mistake of mistakes) {
    const group = ensure(mistake.source.materialId, mistake.source.materialName);
    group.mistakes.push(mistake);
    if (mistake.updatedAt > group.lastPracticedAt) group.lastPracticedAt = mistake.updatedAt;
  }

  for (const group of groups.values()) {
    const seen = new Set<string>();
    group.questions = group.sessions.flatMap((session) =>
      session.questions.filter((question) => {
        const key = questionKey(question);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      }),
    );
  }

  return [...groups.values()].sort((left, right) =>
    right.lastPracticedAt.localeCompare(left.lastPracticedAt),
  );
}

export function findStudyMaterial(
  materials: StudyMaterial[],
  id: string,
): StudyMaterial | undefined {
  return materials.find((material) => material.id === id);
}
