import { z } from "zod";

export const STUDY_LIBRARY_KEY = "paper-plane-quiz-library-v1";
export const STUDY_LIBRARY_UPDATED_EVENT = "paper-quiz-library-updated";
export const STUDY_MATERIAL_OPEN_EVENT = "paper-quiz-open-material";
const MAX_LIBRARY_ITEMS = 50;

export type StudyLibraryRecord = {
  id: string;
  name: string;
  uploadedAt: string;
  lastOpenedAt: string;
};

const LibraryRecordSchema = z.object({
  id: z.string().min(1).max(240),
  name: z.string().min(1).max(200),
  uploadedAt: z.string(),
  lastOpenedAt: z.string(),
});

export function readStudyLibrary(value: string | null): StudyLibraryRecord[] {
  try {
    const parsed: unknown = JSON.parse(value || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed
      .flatMap((item) => {
        const result = LibraryRecordSchema.safeParse(item);
        return result.success ? [result.data] : [];
      })
      .slice(0, MAX_LIBRARY_ITEMS);
  } catch {
    return [];
  }
}

export function upsertStudyLibrary(
  records: StudyLibraryRecord[],
  record: StudyLibraryRecord,
): StudyLibraryRecord[] {
  const next = [record, ...records.filter((item) => item.id !== record.id)];
  return next
    .sort((left, right) => libraryDate(right).localeCompare(libraryDate(left)))
    .slice(0, MAX_LIBRARY_ITEMS);
}

function libraryDate(record: StudyLibraryRecord) {
  return record.lastOpenedAt || record.uploadedAt;
}
