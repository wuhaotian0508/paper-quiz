import type { ExamReviewSheet } from "./exam-review";

export type SharedReviewTopic = Omit<ExamReviewSheet["topics"][number], "relatedMistakeIds">;
export type SharedReviewSheet = { title: string; topics: SharedReviewTopic[] };

export function buildSharedReview(sheet: ExamReviewSheet): SharedReviewSheet {
  return {
    title: sheet.title,
    topics: sheet.topics.map(({ relatedMistakeIds: _privateIds, ...topic }) => topic),
  };
}

export function getSharedReviewUrl(origin: string, slug: string) {
  return new URL(`/review/${encodeURIComponent(slug)}`, origin).toString();
}
