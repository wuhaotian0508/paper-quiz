"use client";

import { useEffect, useMemo, useState } from "react";
import { correctAnswerText, questionTypeLabel } from "@/lib/quiz";
import {
  downloadExamReviewPdf,
  downloadMistakesPdf,
  downloadQuizPdf,
} from "@/lib/pdf-export";
import type { MistakeBookEntry } from "@/lib/mistake-book";
import type { StudyMaterial } from "@/lib/study-material";
import type { StudySession } from "@/lib/study-history";
import { hasSource } from "@/lib/study-history";
import { ExamReviewSheetSchema, type ExamReviewSheet } from "@/lib/exam-review";
import { postForm } from "@/lib/api-client";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { createSharedReview } from "@/lib/shared-review-client";
import { getSharedReviewUrl } from "@/lib/shared-review";
import { getSavedExamReview, saveExamReview } from "@/lib/saved-exam-review";
import {
  dedupeSourcePages,
  extractPageNumber,
  readSourcePdf,
  readSourcePdfTranscript,
  readSourcePageImages,
  renderAndStorePdfPages,
  SOURCE_PAGES_UPDATED_EVENT,
  storeSourcePdf,
  type SourcePageImage,
} from "@/lib/source-pages";

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
  const [examReview, setExamReview] = useState<ExamReviewSheet | null>(null);
  const [examReviewSavedAt, setExamReviewSavedAt] = useState("");
  const [examReviewLoading, setExamReviewLoading] = useState(false);
  const [examReviewError, setExamReviewError] = useState("");
  const [reviewShareLoading, setReviewShareLoading] = useState(false);
  const [reviewShareStatus, setReviewShareStatus] = useState("");
  const [reviewShareUrl, setReviewShareUrl] = useState("");
  const [sourcePages, setSourcePages] = useState<SourcePageImage[]>([]);
  const [previewPage, setPreviewPage] = useState<SourcePageImage | null>(null);
  const [attachedSourceFile, setAttachedSourceFile] = useState<File | null>(null);
  const [sourcePdf, setSourcePdf] = useState<File | null>(null);
  const [sourcePdfUrl, setSourcePdfUrl] = useState("");
  const [attachedSourceTranscript, setAttachedSourceTranscript] = useState("");
  const [attachedSourceStatus, setAttachedSourceStatus] = useState("");
  useEffect(() => {
    let active = true;
    const load = () => {
      void readSourcePageImages(material.id).then((pages) => {
        if (active) setSourcePages(pages);
      });
      void readSourcePdf(material.id).then((file) => {
        if (active && file) {
          setSourcePdf(file);
          setAttachedSourceFile(file);
        }
      });
      void readSourcePdfTranscript(material.id).then((transcript) => {
        if (active && transcript) setAttachedSourceTranscript(transcript);
      });
    };
    load();
    const handleUpdate = (event: Event) => {
      if ((event as CustomEvent<string>).detail === material.id) load();
    };
    window.addEventListener(SOURCE_PAGES_UPDATED_EVENT, handleUpdate);
    return () => {
      active = false;
      window.removeEventListener(SOURCE_PAGES_UPDATED_EVENT, handleUpdate);
    };
  }, [material.id]);
  useEffect(() => {
    const saved = getSavedExamReview(material.id);
    setExamReview(saved?.review || null);
    setExamReviewSavedAt(saved?.updatedAt || "");
  }, [material.id]);
  useEffect(() => {
    if (!sourcePdf) {
      setSourcePdfUrl("");
      return;
    }
    const url = URL.createObjectURL(sourcePdf);
    setSourcePdfUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [sourcePdf]);
  useEffect(() => {
    if (!previewPage) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPreviewPage(null);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [previewPage]);
  const toggle = (id: string) =>
    setExpanded((values) =>
      values.includes(id) ? values.filter((value) => value !== id) : [...values, id],
    );
  const asQuiz = { title: material.name, summary: "", questions: material.questions };
  const reviewSource = [
    ...material.sessions.map((session) => session.source),
    ...material.mistakes.map((mistake) => mistake.source),
  ].find(hasSource);
  const hasReviewContext = Boolean(reviewSource || material.questions.length || material.mistakes.length);
  const savedQuestionContext = material.questions
    .slice(0, 40)
    .map((question) =>
      JSON.stringify({
        prompt: question.prompt,
        answer: correctAnswerText(question),
        explanation: question.explanation,
        sourceNote: question.sourceNote,
      }),
    )
    .join("\n");
  const generateExamReview = async () => {
    if (!hasReviewContext) return;
    setExamReviewLoading(true);
    setExamReviewError("");
    setReviewShareStatus("");
    setReviewShareUrl("");
    try {
      const form = new FormData();
      const fileIds = reviewSource?.fileIds?.length
        ? reviewSource.fileIds
        : reviewSource?.fileId
          ? [reviewSource.fileId]
          : [];
      if (attachedSourceTranscript) form.set("transcript", attachedSourceTranscript);
      else if (attachedSourceFile) form.set("file", attachedSourceFile);
      else if (fileIds.length) form.set("fileIds", JSON.stringify(fileIds));
      else if (reviewSource?.transcript) form.set("transcript", reviewSource.transcript);
      else form.set("questionContext", savedQuestionContext);
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
      const review = ExamReviewSheetSchema.parse(payload);
      setExamReview(review);
      const saved = saveExamReview(material.id, review);
      setExamReviewSavedAt(saved?.updatedAt || "");
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
        sourcePages: reviewSourcePages.map(({ pageNumber, imageUrl }) => ({ pageNumber, imageUrl })),
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

  const reviewSourcePages = useMemo(() => {
    if (!examReview) return [];
    const pageNumbers = new Set(
      examReview.topics
        .map((topic) => extractPageNumber(topic.sourceNote))
        .filter((page): page is number => page !== null),
    );
    return dedupeSourcePages(sourcePages.filter((page) => pageNumbers.has(page.pageNumber)));
  }, [examReview, sourcePages]);

  const attachOriginalPdf = (file: File | undefined) => {
    if (!file) return;
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      setAttachedSourceStatus("Please choose the original PDF file.");
      return;
    }
    setAttachedSourceFile(file);
    setSourcePdf(file);
    setAttachedSourceTranscript("");
    setAttachedSourceStatus("Preparing PDF page previews. Generate the review again when ready.");
    void storeSourcePdf(file, material.id);
    void renderAndStorePdfPages(file, material.id).then((transcript) => {
      void storeSourcePdf(file, material.id, transcript);
      setAttachedSourceTranscript(transcript);
      setAttachedSourceStatus(
        transcript
          ? "Original PDF attached. Generate the review to add page citations and previews."
          : "PDF pages are ready. Generate the review to use the saved question context and show its cited pages.",
      );
    });
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
            className="text-button framed-button"
            disabled={!material.questions.length}
            onClick={() => downloadQuizPdf(asQuiz, "answer_key")}
          >
            Export all questions
          </button>
        </div>
      </header>
      {!reviewSource && hasReviewContext ? (
        <div className="material-review-source-note">
          <p>The original PDF source has expired, so this review will use the saved questions from this PDF plus its mistakes.</p>
          <label className="text-button framed-button material-source-attach">
            Attach original PDF
            <input
              aria-label="Attach original PDF for source pages"
              type="file"
              accept="application/pdf,.pdf"
              onChange={(event) => attachOriginalPdf(event.target.files?.[0])}
            />
          </label>
          {attachedSourceStatus ? <small>{attachedSourceStatus}</small> : null}
        </div>
      ) : !hasReviewContext ? (
        <p className="material-review-source-note">Generate a quiz from this PDF first to create its review sheet.</p>
      ) : null}

      <section className="material-review-builder" aria-labelledby="knowledge-review-heading">
        <div>
          <div className="eyebrow">Knowledge-point review</div>
          <h2 id="knowledge-review-heading">Build your AI Review Sheet</h2>
          <p>Key concepts, common confusions, and targeted recall from this PDF.</p>
        </div>
        <div className="material-review-builder-actions">
          <button
            aria-label="Generate knowledge-point review sheet"
            className="primary-button material-review-action"
            disabled={!hasReviewContext || examReviewLoading}
            onClick={() => void generateExamReview()}
          >
            {examReviewLoading ? "Generating knowledge-point review..." : "Generate knowledge-point review sheet"}
          </button>
          <button
            aria-label="Open this PDF's mistakes"
            className="text-button framed-button"
            disabled={!material.mistakes.length}
            onClick={() => setTab("mistakes")}
          >
            Open this PDF&apos;s mistakes ({material.mistakes.length})
          </button>
        </div>
      </section>

      <section className="material-session-history" aria-labelledby="material-session-heading">
        <div>
          <div className="eyebrow">Generated quizzes</div>
          <h2 id="material-session-heading">Practice sets from this PDF</h2>
          <p>Open any quiz created from this document, or use the review action above to revisit its source-grounded weak points.</p>
        </div>
        {material.sessions.length ? (
          <div className="material-session-list">
            {material.sessions.map((session) => (
              <div className="material-session-card" key={session.id}>
                <div>
                  <strong>{session.title}</strong>
                  <small>
                    {new Date(session.createdAt).toLocaleDateString()} · {session.questions.length} question
                    {session.questions.length === 1 ? "" : "s"}
                  </small>
                </div>
                <button
                  aria-label={`Open ${session.title}`}
                  className="text-button framed-button"
                  disabled={!onOpenSession}
                  onClick={() => onOpenSession?.(session)}
                >
                  Open quiz
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="material-session-empty">No generated quiz is saved for this PDF yet.</p>
        )}
      </section>

      {examReviewError && (
        <p className="mistake-empty" role="alert">
          {examReviewError}
        </p>
      )}
      {examReview && (
        <section className="material-review-sheet" aria-label={`${material.name} exam review`}>
          <div className="material-review-heading">
            <div>
              <div className="eyebrow">Knowledge-point review</div>
              <h2>{examReview.title}</h2>
              <p>Core concepts from this PDF, organized for fast review.</p>
              {examReviewSavedAt ? (
                <small className="material-review-saved">Saved in this browser · {new Date(examReviewSavedAt).toLocaleString()}</small>
              ) : null}
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
            {examReview.topics.map((topic, index) => {
              const pageNumber = extractPageNumber(topic.sourceNote);
              const sourcePage = pageNumber
                ? sourcePages.find((page) => page.pageNumber === pageNumber)
                : undefined;
              return (
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
                    <small>Source: {topic.sourceNote}</small>
                  </div>
                  <aside className="review-topic-source" aria-label={`Source for ${topic.topic}`}>
                    {sourcePage ? (
                      <>
                        <button
                          className="review-topic-preview"
                          aria-label={`Enlarge PDF page ${sourcePage.pageNumber} for ${topic.topic}`}
                          onClick={() => setPreviewPage(sourcePage)}
                        >
                          {/* Local IndexedDB previews are data URLs; next/image cannot optimize them. */}
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={sourcePage.imageUrl} alt={`PDF page ${sourcePage.pageNumber} for ${topic.topic}`} loading="lazy" />
                        </button>
                        <small>Page {sourcePage.pageNumber}</small>
                      </>
                    ) : (
                      <small>Source page preview unavailable</small>
                    )}
                    <button
                      className="text-button"
                      disabled={!sourcePdfUrl || !pageNumber}
                      onClick={() => window.open(`${sourcePdfUrl}#page=${pageNumber}`, "_blank", "noopener,noreferrer")}
                    >
                      {sourcePdfUrl && pageNumber ? "Open PDF" : "Attach PDF to open"}
                    </button>
                  </aside>
                </article>
              );
            })}
          </div>
        </section>
      )}

      {previewPage ? (
        <div className="source-page-lightbox" role="dialog" aria-modal="true" aria-label={`PDF page ${previewPage.pageNumber} preview`} onClick={() => setPreviewPage(null)}>
          <div className="source-page-lightbox-card" onClick={(event) => event.stopPropagation()}>
            <div>
              <div className="eyebrow">PDF source</div>
              <h2>Page {previewPage.pageNumber}</h2>
            </div>
            <button className="text-button" aria-label="Close PDF page preview" onClick={() => setPreviewPage(null)}>
              Close
            </button>
            {/* Local IndexedDB previews are data URLs; next/image cannot optimize them. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={previewPage.imageUrl} alt={`Enlarged PDF page ${previewPage.pageNumber}`} />
            <button
              className="primary-button"
              disabled={!sourcePdfUrl}
              onClick={() => window.open(`${sourcePdfUrl}#page=${previewPage.pageNumber}`, "_blank", "noopener,noreferrer")}
            >
              Open PDF at this page
            </button>
          </div>
        </div>
      ) : null}

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
