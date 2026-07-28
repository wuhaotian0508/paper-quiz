import type { GradeResult, Question } from "@/lib/quiz";
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

export function readMistakes(value: string | null): MistakeBookEntry[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
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
        .map((entry) => ({
          ...entry,
          source: entry.source ? boundSource(entry.source) : EMPTY_SOURCE,
        }))
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
  const entry: MistakeBookEntry = {
    version: 1,
    id: question.id,
    question,
    answer,
    status: grade.status,
    score: grade.score,
    feedback: grade.feedback,
    missingPoints: grade.missingPoints,
    updatedAt: new Date().toISOString(),
    source: boundSource(source),
  };
  return [entry, ...entries.filter((existing) => existing.id !== question.id)];
}

export const MISTAKE_BOOK_KEY = "paper-plane-quiz-mistakes-v1";
