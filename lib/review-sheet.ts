import type { MistakeBookEntry } from "@/lib/mistake-book";
import { correctAnswerText } from "@/lib/quiz";

export type WeaknessReviewItem = {
  id: string;
  prompt: string;
  keyAnswer: string;
  remember: string;
  action: string;
};

export type WeaknessReviewSheet = { items: WeaknessReviewItem[] };

/** Builds a compact study aid from saved mistakes without retaining source-file metadata. */
export function buildWeaknessReviewSheet(entries: MistakeBookEntry[]): WeaknessReviewSheet {
  const items = [...entries]
    .sort((left, right) => left.score - right.score || right.updatedAt.localeCompare(left.updatedAt))
    .slice(0, 8)
    .map((entry) => ({
      id: entry.id,
      prompt: entry.question.prompt,
      keyAnswer: correctAnswerText(entry.question),
      remember: entry.missingPoints.join("; ") || entry.feedback,
      action: "Try this question again before checking the answer.",
    }));
  return { items };
}
