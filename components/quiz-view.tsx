"use client";

import type { GradeResult, Question, Quiz } from "@/lib/quiz";
import { downloadQuizPdf } from "@/lib/pdf-export";
import { useLocale } from "@/hooks/use-locale";
import type { MessageKey } from "@/lib/i18n";

const questionTypeKeys: Record<string, MessageKey> = {
  multiple_choice: "quiz.typeMultipleChoice",
  fill_blank: "quiz.typeFillBlank",
  short_answer: "quiz.typeShortAnswer",
};

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
  const { t } = useLocale();
  const typeKey = questionTypeKeys[current.type];
  const label =
    current.type === "custom"
      ? current.customLabel || t("quiz.customQuestion")
      : typeKey
        ? t(typeKey)
        : current.type.replaceAll("_", " ");
  // A restored session has no PDF in memory, so written grading and tutor chat are
  // unavailable until the lecture is uploaded again. Say so instead of failing on submit.
  const blocked = needsSourceMaterial(current) && !hasSourceMaterial;

  return (
    <section className="quiz-shell">
      <div className="workspace-toolbar">
        <button className="text-button" onClick={() => downloadQuizPdf(quiz, "student")}>
          {t("quiz.studentCopy")}
        </button>
        <button className="text-button" onClick={() => downloadQuizPdf(quiz, "answer_key")}>
          {t("quiz.answerKey")}
        </button>
        <button className="text-button" onClick={onOpenMistakes}>
          {t("quiz.mistakeBookCount", { count: mistakeCount })}
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
        <div className="question-kicker">
          {t("quiz.questionKicker")} {String(index + 1).padStart(2, "0")}
        </div>
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
            aria-label={t("quiz.yourAnswerAria")}
            disabled={submitted}
            value={answer}
            onChange={(event) => onAnswerChange(event.target.value)}
            placeholder={t("quiz.answerPlaceholder")}
            rows={current.type === "fill_blank" ? 3 : 7}
          />
        )}
        {blocked && !submitted && (
          <div className="error-message">{t("quiz.blockedNotice")}</div>
        )}
        {error && <div className="error-message">{error}</div>}
        {submitted && grade && (
          <div className={`explanation ${grade.status === "correct" ? "is-correct" : "is-wrong"}`}>
            <div className="explanation-title">
              {grade.status === "correct"
                ? t("quiz.correct")
                : grade.status === "partial"
                  ? t("quiz.partlyCorrect")
                  : t("quiz.reviewReasoning")}{" "}
              - {Math.round(grade.score * 100)}%
            </div>
            <p>{grade.feedback}</p>
            {grade.missingPoints.length > 0 && (
              <p>{t("quiz.stillToInclude", { points: grade.missingPoints.join(", ") })}</p>
            )}
            {current.type !== "multiple_choice" && (
              <p>
                <strong>{t("quiz.referenceAnswer")}</strong> {current.referenceAnswer}
              </p>
            )}
            <span className="source-note">
              {t("quiz.sourceLabel", { note: current.sourceNote })}
            </span>
          </div>
        )}
        {submitted && hasSourceMaterial && (
          <div className="chat-box">
            <strong>{t("quiz.askAbout")}</strong>
            <p>{t("quiz.askDescription")}</p>
            {chat.map((message, messageIndex) => (
              <div className={`chat-message ${message.role}`} key={messageIndex}>
                {message.content}
              </div>
            ))}
            <div className="chat-compose">
              <input
                aria-label={t("quiz.askFollowUpAria")}
                value={chatInput}
                onChange={(event) => onChatInputChange(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") onAsk();
                }}
                placeholder={t("quiz.askPlaceholder")}
              />
              <button
                className="primary-button"
                disabled={chatting || !chatInput.trim()}
                onClick={onAsk}
              >
                {chatting ? t("quiz.thinking") : t("quiz.ask")}
              </button>
            </div>
          </div>
        )}
      </div>
      <div className="quiz-actions">
        <button className="text-button" onClick={onExit}>
          {t("quiz.exit")}
        </button>
        {!submitted ? (
          <>
            <button className="text-button" onClick={onNext}>
              {t("quiz.skip")}
            </button>
            <button
              className="primary-button"
              disabled={!answer.trim() || loading || blocked}
              onClick={onSubmit}
            >
              {loading ? t("quiz.grading") : t("quiz.submitAnswer")}
            </button>
          </>
        ) : (
          <button className="primary-button" onClick={onNext}>
            {index === quiz.questions.length - 1 ? t("quiz.viewResults") : t("quiz.nextQuestion")}
          </button>
        )}
      </div>
    </section>
  );
}
