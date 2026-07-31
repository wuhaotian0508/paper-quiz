import { questionKey, type GradeResult, type Question } from "@/lib/quiz";
import { boundSource, EMPTY_SOURCE, type PersistedSource } from "@/lib/study-history";

export type MistakeBookEntry = {
  version: 1;
  id: string;
  question: Question;
  answer: string;
  status: "partial" | "incorrect";
  score: number;
  feedback: string;
  missingPoints: string[];
  updatedAt: string;
  /** Kept so re-practising a written question can still be graded after a reload. */
  source: PersistedSource;
};

/**
 * Keyed on question content, not `question.id`: every quiz numbers from q1, so keying on
 * the id made each new quiz's first mistake evict the previous one. Two quizzes that
 * genuinely ask the same thing still collapse into one entry.
 */
export const mistakeKey = questionKey;

export function readMistakes(value: string | null): MistakeBookEntry[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    const seen = new Set<string>();
    return (
      parsed
        .filter((entry): entry is MistakeBookEntry =>
          Boolean(
            entry &&
              typeof entry === "object" &&
              "version" in entry &&
              (entry as MistakeBookEntry).version === 1 &&
              typeof (entry as MistakeBookEntry).id === "string" &&
              "question" in entry,
          ),
        )
        // Entries written before source tracking existed load without a source.
        // Ids are recomputed so books saved under the old per-quiz ids keep deduping.
        .map((entry) => ({
          ...entry,
          id: mistakeKey(entry.question),
          source: boundSource(entry.source),
        }))
        // Newest first on disk, so the first occurrence of a key is the one to keep.
        .filter((entry) => !seen.has(entry.id) && seen.add(entry.id))
    );
  } catch {
    return [];
  }
}

export function addMistake(
  entries: MistakeBookEntry[],
  question: Question,
  answer: string,
  grade: GradeResult,
  source: PersistedSource = EMPTY_SOURCE,
): MistakeBookEntry[] {
  if (grade.status === "correct") return entries;
  const id = mistakeKey(question);
  const entry: MistakeBookEntry = {
    version: 1,
    id,
    question,
    answer,
    status: grade.status,
    score: grade.score,
    feedback: grade.feedback,
    missingPoints: grade.missingPoints,
    updatedAt: new Date().toISOString(),
    source: boundSource(source),
  };
  return [entry, ...entries.filter((existing) => existing.id !== id)];
}

export const MISTAKE_BOOK_KEY = "paper-plane-quiz-mistakes-v1";
