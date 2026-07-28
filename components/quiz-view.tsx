"use client";

import type { GradeResult, Question, Quiz } from "@/lib/quiz";
import { downloadQuizPdf } from "@/lib/pdf-export";

export type ChatMessage = { role: "user" | "assistant"; content: string };

/** Multiple-choice and fill-blank are graded in the browser; the rest need the source material. */
export const needsSourceMaterial = (question: Question) =>
  question.type !== "multiple_choice" && question.type !== "fill_blank";

export function QuizView({
  quiz,
  current,
  index,
  answer,
  submitted,
  grade,
  loading,
  error,
  chat,
  chatInput,
  chatting,
  mistakeCount,
  hasSourceMaterial,
  onAnswerChange,
  onChatInputChange,
  onAsk,
  onSubmit,
  onNext,
  onExit,
  onOpenMistakes,
}: {
  quiz: Quiz;
  current: Question;
  index: number;
  answer: string;
  submitted: boolean;
  grade?: GradeResult;
  loading: boolean;
  error: string;
  chat: ChatMessage[];
  chatInput: string;
  chatting: boolean;
  mistakeCount: number;
  hasSourceMaterial: boolean;
  onAnswerChange: (value: string) => void;
  onChatInputChange: (value: string) => void;
  onAsk: () => void;
  onSubmit: () => void;
  onNext: () => void;
  onExit: () => void;
  onOpenMistakes: () => void;
}) {
  const label =
    current.type === "custom"
      ? current.customLabel || "Custom question"
      : current.type.replaceAll("_", " ");
  // A restored session has no PDF in memory, so written grading and tutor chat are
  // unavailable until the lecture is uploaded again. Say so instead of failing on submit.
  const blocked = needsSourceMaterial(current) && !hasSourceMaterial;

  return (
    <section className="quiz-shell">
      <div className="workspace-toolbar">
        <button className="text-button" onClick={() => downloadQuizPdf(quiz, "student")}>
          Student copy (no answers)
        </button>
        <button className="text-button" onClick={() => downloadQuizPdf(quiz, "answer_key")}>
          Answer key (with answers)
        </button>
        <button className="text-button" onClick={onOpenMistakes}>
          Mistake book ({mistakeCount})
        </button>
      </div>
      <div className="quiz-topline">
        <span className="eyebrow">
          {quiz.title} - {label}
        </span>
        <span className="quiz-count">
          {index + 1} / {quiz.questions.length}
        </span>
      </div>
      <div className="progress-track">
        <span
          style={{ width: `${((index + (submitted ? 1 : 0)) / quiz.questions.length) * 100}%` }}
        />
      </div>
      <div className="question-card">
        <div className="question-kicker">QUESTION {String(index + 1).padStart(2, "0")}</div>
        <h1>{current.prompt}</h1>
        {current.type === "multiple_choice" ? (
          <div className="option-list">
            {current.options.map((option) => (
              <button
                key={option.id}
                disabled={submitted}
                className={`answer-option ${answer === option.id ? "is-selected" : ""} ${submitted && option.id === current.correctOptionId ? "is-correct" : ""} ${submitted && answer === option.id && option.id !== current.correctOptionId ? "is-wrong" : ""}`}
                onClick={() => onAnswerChange(option.id)}
              >
                <span className="option-letter">{option.id.toUpperCase()}</span>
                <span>{option.text}</span>
              </button>
            ))}
          </div>
        ) : (
          <textarea
            className="written-answer"
            aria-label="Your answer"
            disabled={submitted}
            value={answer}
            onChange={(event) => onAnswerChange(event.target.value)}
            placeholder="Write your answer here..."
            rows={current.type === "fill_blank" ? 3 : 7}
          />
        )}
        {blocked && !submitted && (
          <div className="error-message">
            This question is graded against your lecture, which is no longer loaded. Upload the same
            study file again to grade it, or check the reference answer in the answer key.
          </div>
        )}
        {error && <div className="error-message">{error}</div>}
        {submitted && grade && (
          <div className={`explanation ${grade.status === "correct" ? "is-correct" : "is-wrong"}`}>
            <div className="explanation-title">
              {grade.status === "correct"
                ? "Correct"
                : grade.status === "partial"
                  ? "Partly correct"
                  : "Review this reasoning"}{" "}
              - {Math.round(grade.score * 100)}%
            </div>
            <p>{grade.feedback}</p>
            {grade.missingPoints.length > 0 && (
              <p>Still to include: {grade.missingPoints.join(", ")}</p>
            )}
            {current.type !== "multiple_choice" && (
              <p>
                <strong>Reference answer:</strong> {current.referenceAnswer}
              </p>
            )}
            <span className="source-note">Source: {current.sourceNote}</span>
          </div>
        )}
        {submitted && hasSourceMaterial && (
          <div className="chat-box">
            <strong>Ask about this question</strong>
            <p>
              Ask for an explanation, comparison, or a worked step. Replies stay grounded in your
              lecture.
            </p>
            {chat.map((message, messageIndex) => (
              <div className={`chat-message ${message.role}`} key={messageIndex}>
                {message.content}
              </div>
            ))}
            <div className="chat-compose">
              <input
                aria-label="Ask a follow-up question"
                value={chatInput}
                onChange={(event) => onChatInputChange(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") onAsk();
                }}
                placeholder="What is still unclear?"
              />
              <button
                className="primary-button"
                disabled={chatting || !chatInput.trim()}
                onClick={onAsk}
              >
                {chatting ? "Thinking..." : "Ask"}
              </button>
            </div>
          </div>
        )}
      </div>
      <div className="quiz-actions">
        <button className="text-button" onClick={onExit}>
          Exit this quiz
        </button>
        {!submitted ? (
          <>
            <button className="text-button" onClick={onNext}>
              Skip
            </button>
            <button
              className="primary-button"
              disabled={!answer.trim() || loading || blocked}
              onClick={onSubmit}
            >
              {loading ? "Grading..." : "Submit answer"}
            </button>
          </>
        ) : (
          <button className="primary-button" onClick={onNext}>
            {index === quiz.questions.length - 1 ? "View results" : "Next question"}
          </button>
        )}
      </div>
    </section>
  );
}
