"use client";

import { useLocale } from "@/hooks/use-locale";
import type { Question } from "@/lib/quiz";

/**
 * Why each option is right or wrong. Renders nothing for quizzes generated before
 * per-option analysis existed, so saved history keeps working.
 */
export function OptionAnalysis({ question }: { question: Question }) {
  const { t } = useLocale();
  if (question.type !== "multiple_choice") return null;

  const analysed = question.options.filter((option) => option.explanation);
  if (!analysed.length) return null;

  return (
    <div className="option-analysis">
      <div className="option-analysis-title">{t("quiz.optionAnalysis")}</div>
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
    </div>
  );
}
