"use client";

import { useLocale } from "@/hooks/use-locale";
import type { Question } from "@/lib/quiz";

/**
 * Why each option is right or wrong. Quizzes generated before per-option analysis existed
 * carry no explanations; the workspace backfills those on demand, so `loading` covers the
 * gap. Renders nothing where no backfill is possible — a shared or read-only review — so
 * saved history keeps working.
 */
export function OptionAnalysis({
  question,
  loading = false,
}: {
  question: Question;
  loading?: boolean;
}) {
  const { t } = useLocale();
  if (question.type !== "multiple_choice") return null;

  const analysed = question.options.filter((option) => option.explanation);
  if (!analysed.length && !loading) return null;

  return (
    <div className="option-analysis">
      <div className="option-analysis-title">{t("quiz.optionAnalysis")}</div>
      {analysed.length > 0 && (
        <ul>
          {analysed.map((option) => (
            <li
              key={option.id}
              className={option.id === question.correctOptionId ? "is-correct" : ""}
            >
              <span className="option-analysis-letter">{option.id.toUpperCase()}</span>
              <span>{option.explanation}</span>
            </li>
          ))}
        </ul>
      )}
      {loading && <p className="option-analysis-pending">{t("quiz.optionAnalysisLoading")}</p>}
    </div>
  );
}
