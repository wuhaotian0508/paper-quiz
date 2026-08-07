import type { MistakeBookEntry } from "@/lib/mistake-book";
import { correctAnswerText } from "@/lib/quiz";

export type WeaknessReviewItem = {
  id: string;
  prompt: string;
  keyAnswer: string;
  remember: string;
  action: string;
  /**
   * Which PDF this weakness came from, and the page it cites. Only ever used to look up a
   * slide image already rendered into this browser's IndexedDB — the sheet still carries no
   * file handle, provider id, or file name, so it stays safe to export.
   */
  materialId: string;
  sourceNote: string;
};

export type WeaknessReviewSheet = { items: WeaknessReviewItem[] };

/**
 * Builds a compact study aid from saved mistakes. It keeps the citing material id and source
 * note so the sheet can show the slide each weakness came from, and nothing else about the
 * source file.
 */
export function buildWeaknessReviewSheet(entries: MistakeBookEntry[]): WeaknessReviewSheet {
  const items = [...entries]
    .sort(
      (left, right) => left.score - right.score || right.updatedAt.localeCompare(left.updatedAt),
    )
    .slice(0, 8)
    .map((entry) => ({
      id: entry.id,
      prompt: entry.question.prompt,
      keyAnswer: correctAnswerText(entry.question),
      remember: entry.missingPoints.join("; ") || entry.feedback,
      action: "Try this question again before checking the answer.",
      materialId: entry.source.materialId || "",
      sourceNote: entry.question.sourceNote || "",
    }));
  return { items };
}
