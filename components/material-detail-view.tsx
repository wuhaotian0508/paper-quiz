"use client";

import { useState } from "react";
import { correctAnswerText, questionTypeLabel } from "@/lib/quiz";
import {
  downloadExamReviewPdf,
  downloadMaterialReviewPdf,
  downloadMistakesPdf,
  downloadQuizPdf,
} from "@/lib/pdf-export";
import type { MistakeBookEntry } from "@/lib/mistake-book";
import { buildMaterialReviewSheet } from "@/lib/material-review-sheet";
import type { StudyMaterial } from "@/lib/study-material";
import type { StudySession } from "@/lib/study-history";
import { hasSource } from "@/lib/study-history";
import { ExamReviewSheetSchema, type ExamReviewSheet } from "@/lib/exam-review";
import { postForm } from "@/lib/api-client";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { createSharedReview } from "@/lib/shared-review-client";
import { getSharedReviewUrl } from "@/lib/shared-review";

export function MaterialDetailView({
  material,
  onBack,
  onPractice,
  onOpenSession,
}: {
  material: StudyMaterial;
  onBack: () => void;
  onPractice: (entries: MistakeBookEntry[]) => void;
  onOpenSession?: (session: StudySession) => void;
}) {
  const [tab, setTab] = useState<"questions" | "mistakes">("questions");
  const [expanded, setExpanded] = useState<string[]>([]);
  const [reviewGenerated, setReviewGenerated] = useState(false);
  const [examReview, setExamReview] = useState<ExamReviewSheet | null>(null);
  const [examReviewLoading, setExamReviewLoading] = useState(false);
  const [examReviewError, setExamReviewError] = useState("");
  const [reviewShareLoading, setReviewShareLoading] = useState(false);
  const [reviewShareStatus, setReviewShareStatus] = useState("");
  const [reviewShareUrl, setReviewShareUrl] = useState("");
  const toggle = (id: string) =>
    setExpanded((values) =>
      values.includes(id) ? values.filter((value) => value !== id) : [...values, id],
    );
  const asQuiz = { title: material.name, summary: "", questions: material.questions };
  const reviewSheet = buildMaterialReviewSheet(material);
  const reviewMistakes = material.mistakes.filter((entry) =>
    reviewSheet.weaknesses.some((weakness) => weakness.id === entry.id),
  );
  const examReviewMistakes = material.mistakes.filter((entry) =>
    examReview?.topics.some((topic) => topic.relatedMistakeIds.includes(entry.id)),
  );
  const mistakesById = new Map(material.mistakes.map((entry) => [entry.id, entry]));
  const reviewSource = [
    ...material.sessions.map((session) => session.source),
    ...material.mistakes.map((mistake) => mistake.source),
  ].find(hasSource);
  const generateExamReview = async () => {
    if (!reviewSource) return;
    setExamReviewLoading(true);
    setExamReviewError("");
    setReviewShareStatus("");
    setReviewShareUrl("");
    try {
      const form = new FormData();
      const fileIds = reviewSource.fileIds?.length
        ? reviewSource.fileIds
        : reviewSource.fileId
          ? [reviewSource.fileId]
          : [];
      if (fileIds.length) form.set("fileIds", JSON.stringify(fileIds));
      else form.set("transcript", reviewSource.transcript);
      form.set(
        "mistakes",
        JSON.stringify(
          material.mistakes.map((mistake) => ({
            id: mistake.id,
            prompt: mistake.question.prompt,
            answer: mistake.answer,
            referenceAnswer: correctAnswerText(mistake.question),
            feedback: mistake.feedback,
            status: mistake.status,
            sourceNote: mistake.question.sourceNote,
          })),
        ),
      );
      const response = await postForm("/api/generate-exam-review", form, {
        timeoutMessage: "Exam review generation ran past the 60 second limit. Please try again.",
      });
      const payload: unknown = await response.json();
      if (!response.ok)
        throw new Error(
          typeof payload === "object" && payload && "error" in payload
            ? String(payload.error)
            : "Exam review generation failed.",
        );
      setExamReview(ExamReviewSheetSchema.parse(payload));
    } catch (error) {
      setExamReviewError(error instanceof Error ? error.message : "Exam review generation failed.");
    } finally {
      setExamReviewLoading(false);
    }
  };

  const shareExamReview = async () => {
    if (!examReview || reviewShareLoading) return;
    setReviewShareLoading(true);
    setReviewShareStatus("Creating a 7-day review link...");
    try {
      const created = await createSharedReview(getSupabaseBrowserClient(), examReview, {
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      });
      const url = getSharedReviewUrl(window.location.origin, created.slug);
      setReviewShareUrl(url);
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(url);
      setReviewShareStatus("Review link copied. It expires in 7 days.");
    } catch (cause) {
      setReviewShareStatus(
        cause instanceof Error ? cause.message : "Review link could not be created. Please try again.",
      );
    } finally {
      setReviewShareLoading(false);
    }
  };

  const copyReviewShare = async () => {
    if (!reviewShareUrl) return;
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(reviewShareUrl);
      setReviewShareStatus("Review link copied. It expires in 7 days.");
    } else {
      setReviewShareStatus("Select the review link and copy it manually.");
    }
  };

  return (
    <section className="mistake-page">
      <header className="mistake-heading">
        <div>
          <div className="eyebrow">Study material</div>
          <h1>{material.name}</h1>
          <p className="muted-copy">
            <strong>{material.questions.length}</strong> question
            {material.questions.length === 1 ? "" : "s"} and{" "}
            <strong>{material.mistakes.length}</strong> mistake
            {material.mistakes.length === 1 ? "" : "s"} across {material.sessions.length} practice
            set{material.sessions.length === 1 ? "" : "s"}.
          </p>
        </div>
        <div className="mistake-primary-actions">
          <button
            className="text-button framed-button"
            disabled={!material.sessions.length || !onOpenSession}
            onClick={() => onOpenSession?.(material.sessions[0])}
          >
            Continue latest practice
          </button>
          <button
            className="primary-button"
            disabled={!material.mistakes.length}
            onClick={() => onPractice(material.mistakes)}
          >
            Practice its mistakes
          </button>
          <button
            className="text-button framed-button"
            disabled={!material.questions.length}
            onClick={() => downloadQuizPdf(asQuiz, "answer_key")}
          >
            Export all questions
          </button>
          <button className="text-button framed-button" onClick={() => setReviewGenerated(true)}>
            Show practice summary
          </button>
          <button
            className="text-button framed-button"
            disabled={!reviewSource || examReviewLoading}
            onClick={() => void generateExamReview()}
          >
            {examReviewLoading
              ? "Generating personalized review sheet..."
              : "Generate personalized review sheet"}
          </button>
        </div>
      </header>

      {reviewGenerated && (
        <section className="material-review-sheet" aria-label={`${material.name} review sheet`}>
          <div className="material-review-heading">
            <div>
              <div className="eyebrow">PDF review sheet</div>
              <h2>{reviewSheet.title}</h2>
              <p>
                Built only from this PDF&apos;s saved questions, mistakes, and practice sessions.
              </p>
            </div>
            <div className="mistake-primary-actions">
              <button
                className="primary-button"
                disabled={!reviewMistakes.length}
                onClick={() => onPractice(reviewMistakes)}
              >
                Practice these weaknesses
              </button>
              <button
                className="text-button framed-button"
                disabled={!reviewSheet.questionCount && !reviewSheet.mistakeCount}
                onClick={() => downloadMaterialReviewPdf(reviewSheet)}
              >
                Export review sheet PDF
              </button>
            </div>
          </div>

          <div className="material-review-snapshot">
            <span>
              <strong>{reviewSheet.questionCount}</strong> saved questions
            </span>
            <span>
              <strong>{reviewSheet.mistakeCount}</strong> saved mistakes
            </span>
            <span>
              <strong>{reviewSheet.sessionCount}</strong> practice sessions
            </span>
          </div>

          {reviewSheet.questionCount === 0 && (
            <p className="material-review-empty">No saved questions for this material yet.</p>
          )}
          <div className="material-review-grid">
            <div>
              <h3>Weaknesses to revisit</h3>
              {reviewSheet.weaknesses.length ? (
                <div className="review-sheet-list">
                  {reviewSheet.weaknesses.map((item, index) => (
                    <article className="review-sheet-item" key={item.id}>
                      <span>{String(index + 1).padStart(2, "0")}</span>
                      <div>
                        <h2>{item.prompt}</h2>
                        <p>
                          <strong>Key answer:</strong> {item.keyAnswer}
                        </p>
                        <p>
                          <strong>Remember:</strong> {item.remember}
                        </p>
                        <small>Source: {item.sourceNote || "Source section not recorded"}</small>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="material-review-empty">No saved mistakes for this material yet.</p>
              )}
            </div>
            <div className="material-review-coverage">
              <h3>Question coverage</h3>
              <p>Generated questions grouped by their recorded source section.</p>
              {reviewSheet.coverage.length ? (
                <ul>
                  {reviewSheet.coverage.map((item) => (
                    <li key={item.sourceNote}>
                      <span>{item.sourceNote}</span>
                      <strong>{item.questionCount}</strong>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="material-review-empty">No source coverage is recorded yet.</p>
              )}
            </div>
          </div>
        </section>
      )}
      {examReviewError && (
        <p className="mistake-empty" role="alert">
          {examReviewError}
        </p>
      )}
      {examReview && (
        <section className="material-review-sheet" aria-label={`${material.name} exam review`}>
          <div className="material-review-heading">
            <div>
              <div className="eyebrow">Exam review</div>
              <h2>{examReview.title}</h2>
              <p>Grounded in this material&apos;s saved source and prioritized by your mistakes.</p>
            </div>
            <div className="mistake-primary-actions">
              <button
                className="text-button framed-button"
                onClick={() => downloadExamReviewPdf(examReview)}
              >
                Export exam review PDF
              </button>
              <button
                className="text-button framed-button"
                disabled={reviewShareLoading}
                onClick={() => void shareExamReview()}
              >
                {reviewShareLoading ? "Creating review link..." : "Share review link"}
              </button>
              <button
                className="primary-button"
                disabled={!examReviewMistakes.length}
                onClick={() => onPractice(examReviewMistakes)}
              >
                Practice linked mistakes
              </button>
            </div>
          </div>
          {reviewShareUrl ? (
            <div className="share-link-panel" aria-label="Review sharing">
              <label htmlFor="review-share-link">Review share link</label>
              <input id="review-share-link" aria-label="Review share link" readOnly value={reviewShareUrl} />
              <button className="text-button" onClick={() => void copyReviewShare()}>
                Copy link
              </button>
              <a className="text-button" href={reviewShareUrl} target="_blank" rel="noreferrer">
                Open link
              </a>
              <small>Expires in 7 days</small>
              <small>Review notes only; the PDF and private mistakes stay private.</small>
            </div>
          ) : null}
          {reviewShareStatus ? <p className="share-status" role="status">{reviewShareStatus}</p> : null}
          <div className="review-sheet-list">
            {examReview.topics.map((topic, index) => (
              <article className="review-sheet-item" key={`${topic.topic}-${index}`}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <div>
                  <h2>{topic.topic}</h2>
                  <p>{topic.keyIdeas.join(" ")}</p>
                  {topic.formulaOrProcedure && (
                    <p>
                      <strong>Formula or procedure:</strong> {topic.formulaOrProcedure}
                    </p>
                  )}
                  <p>
                    <strong>Common confusion:</strong> {topic.commonConfusion}
                  </p>
                  {topic.mistakeFocus ? (
                    <p>
                      <strong>Your focus:</strong> {topic.mistakeFocus}
                    </p>
                  ) : null}
                  {topic.relatedMistakeIds.map((mistakeId) => {
                    const mistake = mistakesById.get(mistakeId);
                    if (!mistake) return null;
                    return (
                      <div className="mistake-details" key={mistake.id}>
                        <strong>Your missed question</strong>
                        <p>{mistake.question.prompt}</p>
                        <p>
                          <strong>Your answer:</strong> {mistake.answer || "Skipped"}
                        </p>
                        <p>
                          <strong>Feedback:</strong> {mistake.feedback}
                        </p>
                      </div>
                    );
                  })}
                  <small>Source: {topic.sourceNote}</small>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      <div className="mistake-toolbar">
        <div className="filter-pills">
          <button
            className={tab === "questions" ? "is-active" : ""}
            onClick={() => setTab("questions")}
          >
            All questions<span>{material.questions.length}</span>
          </button>
          <button
            className={tab === "mistakes" ? "is-active" : ""}
            onClick={() => setTab("mistakes")}
          >
            Mistakes<span>{material.mistakes.length}</span>
          </button>
        </div>
        {tab === "mistakes" && material.mistakes.length > 0 && (
          <div className="selection-actions">
            <button onClick={() => downloadMistakesPdf(material.mistakes)}>Export mistakes</button>
          </div>
        )}
      </div>

      {tab === "questions" ? (
        material.questions.length ? (
          <div className="mistake-list">
            {material.questions.map((question, index) => {
              const key = `${question.id}-${index}`;
              const isExpanded = expanded.includes(key);
              return (
                <article className="mistake-item is-question" key={key}>
                  <div className="mistake-type">
                    <span>{questionTypeLabel(question)}</span>
                    <small>{question.sourceNote}</small>
                  </div>
                  <div className="mistake-content">
                    <h2>{question.prompt}</h2>
                    {isExpanded && (
                      <div className="mistake-details">
                        <p>
                          <strong>Answer:</strong> {correctAnswerText(question)}
                        </p>
                        <p>
                          <strong>Explanation:</strong> {question.explanation}
                        </p>
                      </div>
                    )}
                    <button className="detail-button" onClick={() => toggle(key)}>
                      {isExpanded ? "Hide answer" : "Show answer"}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="mistake-empty">
            <h2>No saved questions for this material.</h2>
            <p>
              Its practice sets have aged out of this browser, but the mistakes below are still
              here.
            </p>
          </div>
        )
      ) : material.mistakes.length ? (
        <div className="mistake-list">
          {material.mistakes.map((entry) => {
            const isExpanded = expanded.includes(entry.id);
            return (
              <article className="mistake-item" key={entry.id}>
                <div className="mistake-type">
                  <span>{questionTypeLabel(entry.question)}</span>
                  <small>{new Date(entry.updatedAt).toLocaleDateString()}</small>
                </div>
                <div className="mistake-content">
                  <h2>{entry.question.prompt}</h2>
                  <div className="mistake-meta">
                    <span>{entry.status === "partial" ? "Partly correct" : "Incorrect"}</span>
                    <span>{Math.round(entry.score * 100)}%</span>
                  </div>
                  {isExpanded && (
                    <div className="mistake-details">
                      <p>
                        <strong>Your answer:</strong> {entry.answer || "Skipped"}
                      </p>
                      <p>
                        <strong>Correct answer:</strong> {correctAnswerText(entry.question)}
                      </p>
                      <p>
                        <strong>Feedback:</strong> {entry.feedback}
                      </p>
                    </div>
                  )}
                  <button className="detail-button" onClick={() => toggle(entry.id)}>
                    {isExpanded ? "Hide details" : "View details"}
                  </button>
                </div>
                <div className="mistake-item-actions">
                  <button className="primary-button" onClick={() => onPractice([entry])}>
                    Practice again
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="mistake-empty">
          <h2>No mistakes on this material.</h2>
          <p>Everything you have answered from this file was correct.</p>
        </div>
      )}

      <footer className="mistake-footer">
        <button className="text-button" onClick={onBack}>
          Back to PDF history
        </button>
      </footer>
    </section>
  );
}
