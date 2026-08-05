"use client";

import type { GradeResult, Quiz } from "@/lib/quiz";
import { downloadQuizPdf } from "@/lib/pdf-export";

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
  const correct = Object.values(grades).filter((grade) => grade.status === "correct").length;

  return (
    <section className="results-card">
      <div className="eyebrow">Practice complete</div>
      <div className="score-ring">
        <strong>{Math.round((correct / quiz.questions.length) * 100)}</strong>
        <span>pts</span>
      </div>
      <h1>Missed questions are now waiting in your mistake book.</h1>
      <p className="muted-copy">
        Correct {correct} / {quiz.questions.length}
      </p>
      <div className="results-action-groups">
        <div className="quiz-actions">
          <h2>Downloads</h2>
          <button className="text-button" onClick={() => downloadQuizPdf(quiz, "student")}>
            Student copy (no answers)
          </button>
          <button className="text-button" onClick={() => downloadQuizPdf(quiz, "answer_key")}>
            Answer key (with answers)
          </button>
        </div>
        <div className="quiz-actions">
          <h2>Share</h2>
          <button className="text-button" onClick={onShare}>
            Create share link
          </button>
          {shareUrl ? (
            <div className="share-link-panel">
              <label htmlFor="share-link">Share link</label>
              <input id="share-link" readOnly value={shareUrl} />
              <button className="text-button" onClick={onCopyShare}>Copy link</button>
              <a className="text-button" href={shareUrl} target="_blank" rel="noreferrer" onClick={onOpenShare}>
                Open link
              </a>
              <small>Expires in 7 days. Questions only; the source PDF and answer key stay private.</small>
            </div>
          ) : null}
        </div>
      </div>
      <div className="quiz-actions">
        <button className="text-button" onClick={onOpenMistakes}>
          Open mistake book ({mistakeCount})
        </button>
        <button className="primary-button" onClick={onRestart}>
          Upload another lecture
        </button>
      </div>
      {shareStatus ? <p className="share-status" role="status">{shareStatus}</p> : null}
    </section>
  );
}
