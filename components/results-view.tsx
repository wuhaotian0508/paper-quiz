"use client";

import type { GradeResult, Quiz } from "@/lib/quiz";
import { downloadQuizPdf } from "@/lib/pdf-export";

export function ResultsView({
  quiz,
  grades,
  mistakeCount,
  onOpenMistakes,
  onRestart,
}: {
  quiz: Quiz;
  grades: Record<string, GradeResult>;
  mistakeCount: number;
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
      <div className="quiz-actions">
        <button className="text-button" onClick={() => downloadQuizPdf(quiz, "student")}>
          Student copy (no answers)
        </button>
        <button className="text-button" onClick={() => downloadQuizPdf(quiz, "answer_key")}>
          Answer key (with answers)
        </button>
        <button className="text-button" onClick={onOpenMistakes}>
          Open mistake book ({mistakeCount})
        </button>
        <button className="primary-button" onClick={onRestart}>
          Upload another lecture
        </button>
      </div>
    </section>
  );
}
