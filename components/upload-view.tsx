"use client";

import { MAX_GENERATION_BRIEF_CHARS } from "@/lib/request-validation";
import { formatBytes, isAudio } from "@/lib/study-file";
import type { StudySession } from "@/lib/study-history";
import type { DailyReviewPaper } from "@/lib/daily-review";
import type { MistakeBookEntry } from "@/lib/mistake-book";
import { DailyReviewPapers } from "@/components/daily-review-papers";
import { useLocale } from "@/hooks/use-locale";
import type { MessageKey } from "@/lib/i18n";

export const fixedTypes = [
  ["multiple_choice", "upload.typeMultipleChoice"],
  ["fill_blank", "upload.typeFillBlank"],
  ["short_answer", "upload.typeShortAnswer"],
] as const satisfies readonly (readonly [string, MessageKey])[];

export function UploadView({
  files,
  error,
  counts,
  brief,
  loading,
  mistakeCount,
  sessionCount,
  materialCount,
  sessions,
  papers,
  onAcceptFiles,
  onCountsChange,
  onBriefChange,
  onOpenMistakes,
  onOpenProgress,
  onOpenLibrary,
  onOpenSession,
  onSitPaper,
  onStart,
}: {
  files: File[];
  error: string;
  counts: Record<string, number>;
  /** The learner's free-text request for this run; "" when they wrote nothing. */
  brief: string;
  loading: boolean;
  mistakeCount: number;
  sessionCount: number;
  materialCount: number;
  sessions: StudySession[];
  /** Today's per-course review papers, from the Ebbinghaus schedule. */
  papers: DailyReviewPaper[];
  onAcceptFiles: (next?: FileList | File[]) => void;
  onCountsChange: (update: (previous: Record<string, number>) => Record<string, number>) => void;
  onBriefChange: (next: string) => void;
  onOpenMistakes: () => void;
  onOpenProgress: () => void;
  onOpenLibrary: () => void;
  onOpenSession: (session: StudySession) => void;
  onSitPaper: (entries: MistakeBookEntry[]) => void;
  onStart: () => void;
}) {
  const { t } = useLocale();
  const needsTranscription = Boolean(files.length === 1 && isAudio(files[0]));
  const isCombinedPdfSet = files.length > 1;
  const studyDayCount = new Set(
    sessions.map((session) => new Date(session.createdAt).toLocaleDateString()),
  ).size;
  const recentSessions = sessions.slice(0, 4);

  return (
    <section className="dashboard-page">
      <section className="dashboard-upload-card" aria-labelledby="start-quiz-heading">
        <div className="dashboard-section-heading">
          <div>
            <div className="eyebrow">{t("upload.eyebrow")}</div>
            <h2 id="start-quiz-heading">{t("upload.heading")}</h2>
            <p>{t("upload.subheading")}</p>
          </div>
        </div>
        <div className="upload-panel dashboard-upload-panel">
          <label
            className="drop-zone"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              onAcceptFiles(event.dataTransfer.files);
            }}
          >
            <input
              aria-label={t("upload.chooseFileAria")}
              type="file"
              multiple
              accept="application/pdf,.pdf,audio/mpeg,audio/mp4,audio/x-m4a,audio/wav,audio/webm,video/mp4,.mp3,.m4a,.wav,.webm,.mp4"
              onChange={(event) => onAcceptFiles(event.target.files || undefined)}
            />
            <span className="upload-icon">{t("upload.uploadIcon")}</span>
            {files.length ? (
              <>
                {files.map((file) => (
                  <strong key={`${file.name}-${file.size}`}>{file.name}</strong>
                ))}
                <span>
                  {isCombinedPdfSet
                    ? t("upload.pdfsReady", { count: files.length })
                    : t("upload.readyToGenerate", { size: formatBytes(files[0].size) })}
                </span>
              </>
            ) : (
              <>
                <strong>{t("upload.dropHere")}</strong>
                <span>{t("upload.acceptedFormats")}</span>
              </>
            )}
          </label>
          {error && <div className="error-message">{error}</div>}
          <div className="settings-block">
            <div className="setting-heading">
              <span>{t("upload.questionMix")}</span>
              <small>{t("upload.generationLanguageNote")}</small>
            </div>
            <div className="type-grid">
              {fixedTypes.map(([type, labelKey]) => (
                <label key={type}>
                  {t(labelKey)}
                  <input
                    aria-label={t(labelKey)}
                    min="0"
                    max="15"
                    type="number"
                    value={counts[type]}
                    onChange={(event) =>
                      onCountsChange((old) => ({
                        ...old,
                        [type]: Math.max(0, Math.min(15, Number(event.target.value) || 0)),
                      }))
                    }
                  />
                </label>
              ))}
            </div>
            <div className="quiz-brief">
              <label htmlFor="quiz-brief">
                {t("upload.briefLabel")}
                <small>{t("upload.briefHint")}</small>
              </label>
              <textarea
                id="quiz-brief"
                aria-label={t("upload.briefLabel")}
                maxLength={MAX_GENERATION_BRIEF_CHARS}
                placeholder={t("upload.briefPlaceholder")}
                rows={2}
                value={brief}
                onChange={(event) => onBriefChange(event.target.value)}
              />
            </div>
          </div>
          <button
            className="primary-button generate-button"
            disabled={!files.length || loading}
            onClick={onStart}
          >
            {needsTranscription
              ? t("upload.transcribeRecording")
              : isCombinedPdfSet
                ? t("upload.generateCombined")
                : t("upload.generateQuiz")}
          </button>
          <p className="privacy-note">{t("upload.privacyNote")}</p>
        </div>
      </section>

      <DailyReviewPapers papers={papers} onSit={onSitPaper} />

      <section className="dashboard-shortcuts" aria-label={t("upload.shortcutsAria")}>
        <button onClick={onOpenMistakes}>
          <span className="dashboard-shortcut-icon coral" aria-hidden="true">
            !
          </span>
          <span>
            <strong>{t("nav.mistakeBook")}</strong>
            <small>{t("upload.questionsToRevisit", { count: mistakeCount })}</small>
          </span>
          <b aria-hidden="true">-&gt;</b>
        </button>
        <button onClick={onOpenProgress}>
          <span className="dashboard-shortcut-icon mint" aria-hidden="true">
            C
          </span>
          <span>
            <strong>{t("nav.calendar")}</strong>
            <small>{t("upload.recordedStudyDays", { count: studyDayCount })}</small>
          </span>
          <b aria-hidden="true">-&gt;</b>
        </button>
        <button onClick={onOpenLibrary}>
          <span className="dashboard-shortcut-icon blue" aria-hidden="true">
            L
          </span>
          <span>
            <strong>{t("nav.library")}</strong>
            <small>{t("upload.pdfsWithSavedQuestions", { count: materialCount })}</small>
          </span>
          <b aria-hidden="true">-&gt;</b>
        </button>
      </section>

      <section className="dashboard-details">
        <article className="dashboard-detail-card">
          <div className="dashboard-detail-heading">
            <h2>{t("upload.recentPractice")}</h2>
            <button className="text-button" onClick={onOpenLibrary}>
              {t("upload.viewAll")}
            </button>
          </div>
          {recentSessions.length ? (
            <div className="dashboard-session-list">
              {recentSessions.map((session) => (
                <button key={session.id} onClick={() => onOpenSession(session)}>
                  <span>
                    <strong>{session.title}</strong>
                    <small>
                      {t(
                        session.questions.length === 1
                          ? "upload.questionCountOne"
                          : "upload.questionCountOther",
                        { count: session.questions.length },
                      )}
                    </small>
                  </span>
                  <time dateTime={session.createdAt}>
                    {new Date(session.createdAt).toLocaleDateString()}
                  </time>
                </button>
              ))}
            </div>
          ) : (
            <p className="dashboard-empty">{t("upload.noSessions")}</p>
          )}
        </article>
        <article className="dashboard-detail-card calendar-summary-card">
          <div className="dashboard-detail-heading">
            <h2>{t("upload.yourCalendar")}</h2>
            <button className="text-button" onClick={onOpenProgress}>
              {t("upload.openCalendar")}
            </button>
          </div>
          <strong className="calendar-summary-number">{studyDayCount}</strong>
          <p>{t("upload.calendarDaysNote")}</p>
          <button className="primary-button" onClick={onOpenProgress}>
            {t("upload.viewLearningCalendar")}
          </button>
        </article>
      </section>
    </section>
  );
}
