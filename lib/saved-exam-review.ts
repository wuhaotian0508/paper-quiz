import { z } from "zod";
import { ExamReviewSheetSchema, type ExamReviewSheet } from "@/lib/exam-review";

export const SAVED_EXAM_REVIEWS_KEY = "paper-quiz-saved-exam-reviews-v1";
const MAX_SAVED_REVIEWS = 40;

const SavedExamReviewSchema = z.object({
  materialId: z.string().trim().min(1).max(240),
  review: ExamReviewSheetSchema,
  updatedAt: z.string().datetime(),
});

export type SavedExamReview = z.infer<typeof SavedExamReviewSchema>;

export function readSavedExamReviews(raw: string | null): SavedExamReview[] {
  if (!raw) return [];
  try {
    return z.array(SavedExamReviewSchema).max(MAX_SAVED_REVIEWS).parse(JSON.parse(raw));
  } catch {
    return [];
  }
}

export function getSavedExamReview(materialId: string, storage: Storage = window.localStorage) {
  return readSavedExamReviews(storage.getItem(SAVED_EXAM_REVIEWS_KEY)).find(
    (saved) => saved.materialId === materialId,
  );
}

export function saveExamReview(
  materialId: string,
  review: ExamReviewSheet,
  storage: Storage = window.localStorage,
): SavedExamReview | null {
  const saved = SavedExamReviewSchema.parse({
    materialId,
    review,
    updatedAt: new Date().toISOString(),
  });
  try {
    const others = readSavedExamReviews(storage.getItem(SAVED_EXAM_REVIEWS_KEY)).filter(
      (entry) => entry.materialId !== materialId,
    );
    storage.setItem(
      SAVED_EXAM_REVIEWS_KEY,
      JSON.stringify([saved, ...others].slice(0, MAX_SAVED_REVIEWS)),
    );
    return saved;
  } catch {
    return null;
  }
}
