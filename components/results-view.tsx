"use client";

import type { GradeResult, Quiz } from "@/lib/quiz";
import { downloadQuizPdf } from "@/lib/pdf-export";
import { useLocale } from "@/hooks/use-locale";

export function ResultsView({
  quiz,
  grades,
  mistakeCount,
  shareStatus,
  shareUrl = "",
  onShare,
  onCopyShare,
  onOpenShare,
  onOpenMistakes,
  onRestart,
}: {
  quiz: Quiz;
  grades: Record<string, GradeResult>;
  mistakeCount: number;
  shareStatus: string;
  shareUrl?: string;
  onShare: () => void;
  onCopyShare: () => void;
  onOpenShare: () => void;
  onOpenMistakes: () => void;
  onRestart: () => void;
}) {
  const { t } = useLocale();
  const correct = Object.values(grades).filter((grade) => grade.status === "correct").length;

  return (
    <section className="results-card">
      <div className="eyebrow">{t("results.eyebrow")}</div>
      <div className="score-ring">
        <strong>{Math.round((correct / quiz.questions.length) * 100)}</strong>
        <span>{t("results.pts")}</span>
      </div>
      <h1>{t("results.heading")}</h1>
      <p className="muted-copy">
        {t("results.correctOf", { correct, total: quiz.questions.length })}
      </p>
      <div className="results-action-groups">
        <div className="quiz-actions">
          <h2>{t("results.downloads")}</h2>
          <button className="text-button" onClick={() => downloadQuizPdf(quiz, "student")}>
            {t("quiz.studentCopy")}
          </button>
          <button className="text-button" onClick={() => downloadQuizPdf(quiz, "answer_key")}>
            {t("quiz.answerKey")}
          </button>
        </div>
        <div className="quiz-actions">
          <h2>{t("results.share")}</h2>
          <button className="text-button" onClick={onShare}>
            {t("results.createShareLink")}
          </button>
          {shareUrl ? (
            <div className="share-link-panel">
              <label htmlFor="share-link">{t("results.shareLink")}</label>
              <input id="share-link" readOnly value={shareUrl} />
              <button className="text-button" onClick={onCopyShare}>
                {t("results.copyLink")}
              </button>
              <a
                className="text-button"
                href={shareUrl}
                target="_blank"
                rel="noreferrer"
                onClick={onOpenShare}
              >
                {t("results.openLink")}
              </a>
              <small>{t("results.shareExpiry")}</small>
            </div>
          ) : null}
        </div>
      </div>
      <div className="quiz-actions">
        <button className="text-button" onClick={onOpenMistakes}>
          {t("results.openMistakeBook", { count: mistakeCount })}
        </button>
        <button className="primary-button" onClick={onRestart}>
          {t("results.uploadAnother")}
        </button>
      </div>
      {shareStatus ? (
        <p className="share-status" role="status">
          {shareStatus}
        </p>
      ) : null}
    </section>
  );
}
