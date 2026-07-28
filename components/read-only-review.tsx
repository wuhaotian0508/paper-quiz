"use client";

import { useState } from "react";
import { downloadReviewPdf } from "@/lib/pdf-export";
import type { StudySession } from "@/lib/study-history";

export function ReadOnlyReview({ session, onBack }: { session: StudySession; onBack: () => void }) {
  const [index, setIndex] = useState(0);
  const question = session.questions[index];
  const grade = session.grades[question.id];
  const selected = session.answers[question.id];
  const correct =
    question.type === "multiple_choice"
      ? question.options.find((option) => option.id === question.correctOptionId)?.text
      : question.referenceAnswer;
  return (
    <section className="quiz-shell">
      <div className="workspace-toolbar">
        <button className="text-button" onClick={() => downloadReviewPdf(session)}>
          Export graded review PDF
        </button>
      </div>
      <div className="quiz-topline">
        <span className="eyebrow">Read-only review - {session.title}</span>
        <span className="quiz-count">
          {index + 1} / {session.questions.length}
        </span>
      </div>
      <div className="question-card review-card">
        <div className="question-kicker">QUESTION {String(index + 1).padStart(2, "0")}</div>
        <h1>{question.prompt}</h1>
        {question.type === "multiple_choice" ? (
          <div className="option-list">
            {question.options.map((option) => (
              <div
                className={`answer-option ${selected === option.id ? "is-selected" : ""} ${option.id === question.correctOptionId ? "is-correct" : ""}`}
                key={option.id}
              >
                <span className="option-letter">{option.id.toUpperCase()}</span>
                <span>{option.text}</span>
                {selected === option.id && <span className="option-status">Your answer</span>}
              </div>
            ))}
          </div>
        ) : (
          <div className="review-answer">
            <strong>Your answer</strong>
            <p>{selected || "Skipped"}</p>
          </div>
        )}
        <div className={`explanation ${grade?.status === "correct" ? "is-correct" : "is-wrong"}`}>
          <div className="explanation-title">
            {grade ? `${grade.status} - ${Math.round(grade.score * 100)}%` : "Not graded"}
          </div>
          <p>
            <strong>Correct answer:</strong> {correct}
          </p>
          <p>{grade?.feedback || question.explanation}</p>
          <span className="source-note">Source: {question.sourceNote}</span>
        </div>
      </div>
      <div className="quiz-actions">
        <button className="text-button" onClick={onBack}>
          Back to progress
        </button>
        <button
          className="text-button"
          disabled={index === 0}
          onClick={() => setIndex((value) => value - 1)}
        >
          Previous
        </button>
        <button
          className="primary-button"
          disabled={index === session.questions.length - 1}
          onClick={() => setIndex((value) => value + 1)}
        >
          Next
        </button>
      </div>
    </section>
  );
}
