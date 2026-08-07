"use client";

import { useEffect, useMemo, useState } from "react";
import { correctAnswerText, questionTypeLabel } from "@/lib/quiz";
import { downloadExamReviewPdf, downloadMistakesPdf, downloadQuizPdf } from "@/lib/pdf-export";
import type { MistakeBookEntry } from "@/lib/mistake-book";
import type { StudyMaterial } from "@/lib/study-material";
import type { StudySession } from "@/lib/study-history";
import { hasSource } from "@/lib/study-history";
import { ExamReviewSheetSchema, type ExamReviewSheet } from "@/lib/exam-review";
import { ReviewSheetSections } from "@/components/review-sheet-sections";
import { postForm } from "@/lib/api-client";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { createSharedReview } from "@/lib/shared-review-client";
import { getSharedReviewUrl } from "@/lib/shared-review";
import { createSharedChallenge } from "@/lib/shared-challenge-client";
import { getChallengeShareUrl } from "@/lib/shared-challenge";
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
import { useLocale } from "@/hooks/use-locale";

export function MaterialDetailView({
  material,
  onBack,
  onPractice,
  onOpenSession,
  canShare = true,
}: {
  material: StudyMaterial;
  onBack: () => void;
  onPractice: (entries: MistakeBookEntry[]) => void;
  onOpenSession?: (session: StudySession) => void;
  /** Sharing writes through Supabase, so an anonymous visitor is told to sign in first. */
  canShare?: boolean;
}) {
  const { locale, t } = useLocale();
  const [tab, setTab] = useState<"questions" | "mistakes">("questions");
  const [expanded, setExpanded] = useState<string[]>([]);
  const [examReview, setExamReview] = useState<ExamReviewSheet | null>(null);
  const [examReviewSavedAt, setExamReviewSavedAt] = useState("");
  const [examReviewLoading, setExamReviewLoading] = useState(false);
  const [examReviewError, setExamReviewError] = useState("");
  const [reviewShareLoading, setReviewShareLoading] = useState(false);
  const [reviewShareStatus, setReviewShareStatus] = useState("");
  const [reviewShareUrl, setReviewShareUrl] = useState("");
  const [practiceShareLoading, setPracticeShareLoading] = useState(false);
  const [practiceShareStatus, setPracticeShareStatus] = useState("");
  const [practiceShareUrl, setPracticeShareUrl] = useState("");
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
  const hasReviewContext = Boolean(
    reviewSource || material.questions.length || material.mistakes.length,
  );
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
      form.set("locale", locale);
      const response = await postForm("/api/generate-exam-review", form, {
        timeoutMessage: t("material.reviewTimeout"),
      });
      const payload: unknown = await response.json();
      if (!response.ok)
        throw new Error(
          typeof payload === "object" && payload && "error" in payload
            ? String(payload.error)
            : t("material.reviewFailed"),
        );
      const review = ExamReviewSheetSchema.parse(payload);
      setExamReview(review);
      const saved = saveExamReview(material.id, review);
      setExamReviewSavedAt(saved?.updatedAt || "");
    } catch (error) {
      setExamReviewError(error instanceof Error ? error.message : t("material.reviewFailed"));
    } finally {
      setExamReviewLoading(false);
    }
  };

  const shareExamReview = async () => {
    if (!examReview || reviewShareLoading) return;
    setReviewShareLoading(true);
    setReviewShareStatus(t("material.creatingReviewLinkStatus"));
    try {
      const created = await createSharedReview(getSupabaseBrowserClient(), examReview, {
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        sourcePages: reviewSourcePages.map(({ pageNumber, imageUrl }) => ({
          pageNumber,
          imageUrl,
        })),
      });
      const url = getSharedReviewUrl(window.location.origin, created.slug);
      setReviewShareUrl(url);
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(url);
      setReviewShareStatus(t("material.reviewLinkCopied"));
    } catch (cause) {
      setReviewShareStatus(cause instanceof Error ? cause.message : t("material.reviewLinkFailed"));
    } finally {
      setReviewShareLoading(false);
    }
  };

  const copyReviewShare = async () => {
    if (!reviewShareUrl) return;
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(reviewShareUrl);
      setReviewShareStatus(t("material.reviewLinkCopied"));
    } else {
      setReviewShareStatus(t("material.reviewCopyManually"));
    }
  };

  /**
   * Shares every saved question from this PDF as a challenge, without waiting for a review
   * sheet to be generated first. `buildSharedChallenge` splits the answer key out of the
   * public quiz, so the link hands over the questions but not the answers — which now
   * matters more, since each option carries its own explanation.
   */
  const sharePracticeSet = async () => {
    if (!material.questions.length || practiceShareLoading) return;
    if (!canShare) {
      setPracticeShareStatus(t("material.shareSignInFirst"));
      return;
    }
    setPracticeShareLoading(true);
    setPracticeShareStatus(t("material.creatingPracticeLinkStatus"));
    try {
      const created = await createSharedChallenge(getSupabaseBrowserClient(), asQuiz, {
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      });
      const url = getChallengeShareUrl(window.location.origin, created.slug);
      setPracticeShareUrl(url);
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(url);
      setPracticeShareStatus(t("material.practiceLinkCopied"));
    } catch (cause) {
      setPracticeShareStatus(
        cause instanceof Error ? cause.message : t("material.practiceLinkFailed"),
      );
    } finally {
      setPracticeShareLoading(false);
    }
  };

  const copyPracticeShare = async () => {
    if (!practiceShareUrl) return;
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(practiceShareUrl);
      setPracticeShareStatus(t("material.practiceLinkCopied"));
    } else {
      setPracticeShareStatus(t("material.practiceCopyManually"));
    }
  };

  const reviewSourcePages = useMemo(() => {
    if (!examReview) return [];
    const pageNumbers = new Set(
      [
        // Sections replaced topics in the two-column redesign. Collecting only topic notes is
        // what silently emptied this list, taking the previews and the shared slides with it.
        ...(examReview.sections ?? []).map((section) => section.sourceNote || ""),
        ...(examReview.topics ?? []).map((topic) => topic.sourceNote),
        ...(examReview.sourceNote ? [examReview.sourceNote] : []),
      ]
        .map(extractPageNumber)
        .filter((page): page is number => page !== null),
    );
    return dedupeSourcePages(sourcePages.filter((page) => pageNumbers.has(page.pageNumber)));
  }, [examReview, sourcePages]);

  const slideForSourceNote = useMemo(() => {
    const byPage = new Map(sourcePages.map((page) => [page.pageNumber, page]));
    return (sourceNote: string) => {
      const pageNumber = extractPageNumber(sourceNote);
      return pageNumber ? byPage.get(pageNumber) : undefined;
    };
  }, [sourcePages]);

  const attachOriginalPdf = (file: File | undefined) => {
    if (!file) return;
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      setAttachedSourceStatus(t("material.attachChooseOriginal"));
      return;
    }
    setAttachedSourceFile(file);
    setSourcePdf(file);
    setAttachedSourceTranscript("");
    setAttachedSourceStatus(t("material.attachPreparing"));
    void storeSourcePdf(file, material.id);
    void renderAndStorePdfPages(file, material.id).then((transcript) => {
      void storeSourcePdf(file, material.id, transcript);
      setAttachedSourceTranscript(transcript);
      setAttachedSourceStatus(
        t(transcript ? "material.attachReadyWithTranscript" : "material.attachReadyNoTranscript"),
      );
    });
  };

  return (
    <section className="mistake-page">
      <header className="mistake-heading">
        <div>
          <div className="eyebrow">{t("material.eyebrow")}</div>
          <h1>{material.name}</h1>
          <p className="muted-copy">
            {t("material.summaryJoin", {
              questions: t(
                material.questions.length === 1 ? "material.summaryOne" : "material.summaryOther",
                { questions: material.questions.length },
              ),
              mistakes: t(
                material.mistakes.length === 1
                  ? "material.mistakeCountOne"
                  : "material.mistakeCountOther",
                { mistakes: material.mistakes.length },
              ),
              sets: t(
                material.sessions.length === 1 ? "material.setCountOne" : "material.setCountOther",
                { sets: material.sessions.length },
              ),
            })}
          </p>
        </div>
        <div className="mistake-primary-actions">
          <button
            className="text-button framed-button"
            disabled={!material.sessions.length || !onOpenSession}
            onClick={() => onOpenSession?.(material.sessions[0])}
          >
            {t("material.continueLatest")}
          </button>
          <button
            className="text-button framed-button"
            disabled={!material.questions.length}
            onClick={() => void downloadQuizPdf(asQuiz, "answer_key", locale)}
          >
            {t("material.exportAll")}
          </button>
          <button
            aria-label={t("material.sharePracticeLinkAria", { name: material.name })}
            className="text-button framed-button"
            disabled={!material.questions.length || practiceShareLoading}
            onClick={() => void sharePracticeSet()}
          >
            {practiceShareLoading
              ? t("material.creatingPracticeLink")
              : t("material.sharePracticeLink")}
          </button>
        </div>
      </header>
      {practiceShareUrl ? (
        <div className="share-link-panel" aria-label={t("material.practiceSharingAria")}>
          <label htmlFor="practice-share-link">{t("material.practiceShareLink")}</label>
          <input
            id="practice-share-link"
            aria-label={t("material.practiceShareLink")}
            readOnly
            value={practiceShareUrl}
          />
          <button className="text-button" onClick={() => void copyPracticeShare()}>
            {t("material.copyLink")}
          </button>
          <a className="text-button" href={practiceShareUrl} target="_blank" rel="noreferrer">
            {t("material.openLink")}
          </a>
          <small>{t("material.expiresIn7Days")}</small>
          <small>{t("material.practiceSharePrivacy")}</small>
        </div>
      ) : null}
      {practiceShareStatus ? (
        <p className="share-status" role="status">
          {practiceShareStatus}
        </p>
      ) : null}
      {!reviewSource && hasReviewContext ? (
        <div className="material-review-source-note">
          <p>{t("material.expiredSource")}</p>
          <label className="text-button framed-button material-source-attach">
            {t("material.attachPdf")}
            <input
              aria-label={t("material.attachPdfAria")}
              type="file"
              accept="application/pdf,.pdf"
              onChange={(event) => attachOriginalPdf(event.target.files?.[0])}
            />
          </label>
          {attachedSourceStatus ? <small>{attachedSourceStatus}</small> : null}
        </div>
      ) : !hasReviewContext ? (
        <p className="material-review-source-note">{t("material.noReviewContext")}</p>
      ) : null}

      <section className="material-review-builder" aria-labelledby="knowledge-review-heading">
        <div>
          <div className="eyebrow">{t("material.knowledgeReviewEyebrow")}</div>
          <h2 id="knowledge-review-heading">{t("material.buildReviewSheet")}</h2>
          <p>{t("material.buildReviewSheetNote")}</p>
        </div>
        <div className="material-review-builder-actions">
          <button
            aria-label={t("material.generateReviewAria")}
            className="primary-button material-review-action"
            disabled={!hasReviewContext || examReviewLoading}
            onClick={() => void generateExamReview()}
          >
            {examReviewLoading ? t("material.generatingReview") : t("material.generateReview")}
          </button>
          <button
            aria-label={t("material.openMistakesAria")}
            className="text-button framed-button"
            disabled={!material.mistakes.length}
            onClick={() => setTab("mistakes")}
          >
            {t("material.openMistakes", { count: material.mistakes.length })}
          </button>
        </div>
      </section>

      <section className="material-session-history" aria-labelledby="material-session-heading">
        <div>
          <div className="eyebrow">{t("material.generatedQuizzes")}</div>
          <h2 id="material-session-heading">{t("material.practiceSets")}</h2>
          <p>{t("material.practiceSetsNote")}</p>
        </div>
        {material.sessions.length ? (
          <div className="material-session-list">
            {material.sessions.map((session) => (
              <div className="material-session-card" key={session.id}>
                <div>
                  <strong>{session.title}</strong>
                  <small>
                    {new Date(session.createdAt).toLocaleDateString()} ·{" "}
                    {t(
                      session.questions.length === 1
                        ? "material.summaryOne"
                        : "material.summaryOther",
                      { questions: session.questions.length },
                    )}
                  </small>
                </div>
                <button
                  aria-label={t("material.openQuizAria", { title: session.title })}
                  className="text-button framed-button"
                  disabled={!onOpenSession}
                  onClick={() => onOpenSession?.(session)}
                >
                  {t("material.openQuiz")}
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="material-session-empty">{t("material.noSessions")}</p>
        )}
      </section>

      {examReviewError && (
        <p className="mistake-empty" role="alert">
          {examReviewError}
        </p>
      )}
      {examReview && (
        <section
          className="material-review-sheet"
          aria-label={t("material.reviewAria", { name: material.name })}
        >
          <div className="material-review-heading">
            <div>
              <div className="eyebrow">{t("material.knowledgeReviewEyebrow")}</div>
              <h2>{examReview.title}</h2>
              <p>{t("material.reviewSheetNote")}</p>
              {examReviewSavedAt ? (
                <small className="material-review-saved">
                  {t("material.savedInBrowser", {
                    date: new Date(examReviewSavedAt).toLocaleString(),
                  })}
                </small>
              ) : null}
            </div>
            <div className="mistake-primary-actions">
              <button
                className="text-button framed-button"
                onClick={() => void downloadExamReviewPdf(examReview, locale)}
              >
                {t("material.exportReviewPdf")}
              </button>
              <button
                className="text-button framed-button"
                disabled={reviewShareLoading}
                onClick={() => void shareExamReview()}
              >
                {reviewShareLoading
                  ? t("material.creatingReviewLink")
                  : t("material.shareReviewLink")}
              </button>
            </div>
          </div>
          {reviewShareUrl ? (
            <div className="share-link-panel" aria-label={t("material.reviewSharingAria")}>
              <label htmlFor="review-share-link">{t("material.reviewShareLink")}</label>
              <input
                id="review-share-link"
                aria-label={t("material.reviewShareLink")}
                readOnly
                value={reviewShareUrl}
              />
              <button className="text-button" onClick={() => void copyReviewShare()}>
                {t("material.copyLink")}
              </button>
              <a className="text-button" href={reviewShareUrl} target="_blank" rel="noreferrer">
                {t("material.openLink")}
              </a>
              <small>{t("material.expiresIn7Days")}</small>
              <small>{t("material.reviewSharePrivacy")}</small>
            </div>
          ) : null}
          {reviewShareStatus ? (
            <p className="share-status" role="status">
              {reviewShareStatus}
            </p>
          ) : null}
          <ReviewSheetSections
            sheet={examReview}
            slideFor={slideForSourceNote}
            onPreviewSlide={(slide) => setPreviewPage({ ...slide, materialId: material.id })}
          />
          <div className="review-sheet-list">
            {(examReview.topics ?? []).map((topic, index) => {
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
                        <strong>{t("material.formulaOrProcedure")}</strong>{" "}
                        {topic.formulaOrProcedure}
                      </p>
                    )}
                    <p>
                      <strong>{t("material.commonConfusion")}</strong> {topic.commonConfusion}
                    </p>
                    {topic.mistakeFocus ? (
                      <p>
                        <strong>{t("material.yourFocus")}</strong> {topic.mistakeFocus}
                      </p>
                    ) : null}
                    <small>{t("material.sourceLabel", { note: topic.sourceNote })}</small>
                  </div>
                  <aside
                    className="review-topic-source"
                    aria-label={t("material.sourceForAria", { topic: topic.topic })}
                  >
                    {sourcePage ? (
                      <>
                        <button
                          className="review-topic-preview"
                          aria-label={t("material.enlargePageAria", {
                            page: sourcePage.pageNumber,
                            topic: topic.topic,
                          })}
                          onClick={() => setPreviewPage(sourcePage)}
                        >
                          {/* Local IndexedDB previews are data URLs; next/image cannot optimize them. */}
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={sourcePage.imageUrl}
                            alt={t("material.pdfPageAlt", {
                              page: sourcePage.pageNumber,
                              topic: topic.topic,
                            })}
                            loading="lazy"
                          />
                        </button>
                        <small>{t("material.pageLabel", { page: sourcePage.pageNumber })}</small>
                      </>
                    ) : (
                      <small>{t("material.previewUnavailable")}</small>
                    )}
                    <button
                      className="text-button"
                      disabled={!sourcePdfUrl || !pageNumber}
                      onClick={() =>
                        window.open(
                          `${sourcePdfUrl}#page=${pageNumber}`,
                          "_blank",
                          "noopener,noreferrer",
                        )
                      }
                    >
                      {sourcePdfUrl && pageNumber
                        ? t("material.openPdf")
                        : t("material.attachPdfToOpen")}
                    </button>
                  </aside>
                </article>
              );
            })}
          </div>
        </section>
      )}

      {previewPage ? (
        <div
          className="source-page-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label={t("material.pagePreviewAria", { page: previewPage.pageNumber })}
          onClick={() => setPreviewPage(null)}
        >
          <div className="source-page-lightbox-card" onClick={(event) => event.stopPropagation()}>
            <div>
              <div className="eyebrow">{t("material.pdfSource")}</div>
              <h2>{t("material.pageLabel", { page: previewPage.pageNumber })}</h2>
            </div>
            <button
              className="text-button"
              aria-label={t("material.closePreviewAria")}
              onClick={() => setPreviewPage(null)}
            >
              {t("material.close")}
            </button>
            {/* Local IndexedDB previews are data URLs; next/image cannot optimize them. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewPage.imageUrl}
              alt={t("material.enlargedPageAlt", { page: previewPage.pageNumber })}
            />
            <button
              className="primary-button"
              disabled={!sourcePdfUrl}
              onClick={() =>
                window.open(
                  `${sourcePdfUrl}#page=${previewPage.pageNumber}`,
                  "_blank",
                  "noopener,noreferrer",
                )
              }
            >
              {t("material.openPdfAtPage")}
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
            {t("material.allQuestions")}
            <span>{material.questions.length}</span>
          </button>
          <button
            className={tab === "mistakes" ? "is-active" : ""}
            onClick={() => setTab("mistakes")}
          >
            {t("material.mistakesTab")}
            <span>{material.mistakes.length}</span>
          </button>
        </div>
        {tab === "mistakes" && material.mistakes.length > 0 && (
          <div className="selection-actions">
            <button onClick={() => void downloadMistakesPdf(material.mistakes)}>
              {t("material.exportMistakes")}
            </button>
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
                          <strong>{t("material.answer")}</strong> {correctAnswerText(question)}
                        </p>
                        <p>
                          <strong>{t("material.explanation")}</strong> {question.explanation}
                        </p>
                      </div>
                    )}
                    <button className="detail-button" onClick={() => toggle(key)}>
                      {isExpanded ? t("material.hideAnswer") : t("material.showAnswer")}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="mistake-empty">
            <h2>{t("material.noQuestionsHeading")}</h2>
            <p>{t("material.noQuestionsBody")}</p>
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
                    <span>
                      {entry.status === "partial"
                        ? t("mistakes.partlyCorrect")
                        : t("mistakes.incorrect")}
                    </span>
                    <span>{Math.round(entry.score * 100)}%</span>
                  </div>
                  {isExpanded && (
                    <div className="mistake-details">
                      <p>
                        <strong>{t("mistakes.yourAnswer")}</strong>{" "}
                        {entry.answer || t("mistakes.skipped")}
                      </p>
                      <p>
                        <strong>{t("mistakes.correctAnswer")}</strong>{" "}
                        {correctAnswerText(entry.question)}
                      </p>
                      <p>
                        <strong>{t("mistakes.feedback")}</strong> {entry.feedback}
                      </p>
                    </div>
                  )}
                  <button className="detail-button" onClick={() => toggle(entry.id)}>
                    {isExpanded ? t("mistakes.hideDetails") : t("mistakes.viewDetails")}
                  </button>
                </div>
                <div className="mistake-item-actions">
                  <button className="primary-button" onClick={() => onPractice([entry])}>
                    {t("mistakes.practiceAgain")}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="mistake-empty">
          <h2>{t("material.noMistakesHeading")}</h2>
          <p>{t("material.noMistakesBody")}</p>
        </div>
      )}

      <footer className="mistake-footer">
        <button className="text-button" onClick={onBack}>
          {t("material.backToHistory")}
        </button>
      </footer>
    </section>
  );
}
