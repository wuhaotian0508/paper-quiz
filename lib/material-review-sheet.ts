import { correctAnswerText } from "@/lib/quiz";
import type { StudyMaterial } from "@/lib/study-material";

export type MaterialReviewWeakness = {
  id: string;
  prompt: string;
  keyAnswer: string;
  remember: string;
  sourceNote: string;
};

export type MaterialReviewCoverage = {
  sourceNote: string;
  questionCount: number;
};

export type MaterialReviewSheet = {
  materialId: string;
  title: string;
  questionCount: number;
  mistakeCount: number;
  sessionCount: number;
  weaknesses: MaterialReviewWeakness[];
  coverage: MaterialReviewCoverage[];
};

export function buildMaterialReviewSheet(material: StudyMaterial): MaterialReviewSheet {
  const coverage = new Map<string, number>();
  for (const question of material.questions) {
    const sourceNote = question.sourceNote || "Source section not recorded";
    coverage.set(sourceNote, (coverage.get(sourceNote) || 0) + 1);
  }

  return {
    materialId: material.id,
    title: `${material.name} Review Sheet`,
    questionCount: material.questions.length,
    mistakeCount: material.mistakes.length,
    sessionCount: material.sessions.length,
    weaknesses: [...material.mistakes]
      .sort(
        (left, right) => left.score - right.score || right.updatedAt.localeCompare(left.updatedAt),
      )
      .slice(0, 8)
      .map((entry) => ({
        id: entry.id,
        prompt: entry.question.prompt,
        keyAnswer: correctAnswerText(entry.question),
        remember: entry.missingPoints.join("; ") || entry.feedback,
        sourceNote: entry.question.sourceNote,
      })),
    coverage: [...coverage].map(([sourceNote, questionCount]) => ({ sourceNote, questionCount })),
  };
}
