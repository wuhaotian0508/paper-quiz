import type { ExamReviewSection, ExamReviewSheet, ExamReviewTopic } from "./exam-review";

export type SharedReviewTopic = Omit<ExamReviewTopic, "relatedMistakeIds">;
export type SharedReviewSourcePage = { pageNumber: number; imageUrl: string };
export type SharedReviewSheet = {
  title: string;
  subject?: string;
  scope?: string;
  goal?: string;
  sections?: ExamReviewSection[];
  topics: SharedReviewTopic[];
  sourcePages?: SharedReviewSourcePage[];
};

export function buildSharedReview(
  sheet: ExamReviewSheet,
  sourcePages: SharedReviewSourcePage[] = [],
): SharedReviewSheet {
  const seen = new Set<number>();
  return {
    title: sheet.title,
    ...(sheet.subject ? { subject: sheet.subject } : {}),
    ...(sheet.scope ? { scope: sheet.scope } : {}),
    ...(sheet.goal ? { goal: sheet.goal } : {}),
    ...(sheet.sections?.length ? { sections: sheet.sections } : {}),
    topics: (sheet.topics ?? []).map(({ relatedMistakeIds: _privateIds, ...topic }) => topic),
    ...(sourcePages.length
      ? {
          sourcePages: [...sourcePages]
            .sort((left, right) => left.pageNumber - right.pageNumber)
            .filter((page) => {
              if (seen.has(page.pageNumber)) return false;
              seen.add(page.pageNumber);
              return true;
            }),
        }
      : {}),
  };
}

export function getSharedReviewUrl(origin: string, slug: string) {
  return new URL(`/review/${encodeURIComponent(slug)}`, origin).toString();
}
