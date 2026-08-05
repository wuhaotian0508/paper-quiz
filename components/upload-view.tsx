"use client";

import type { Difficulty } from "@/lib/quiz";
import { formatBytes, isAudio } from "@/lib/study-file";
import type { StudySession } from "@/lib/study-history";
import type { StudyMaterial } from "@/lib/study-material";

export type CustomDraft = { key: string; label: string; instructions: string; count: number };

export const fixedTypes = [
  ["multiple_choice", "Multiple-choice questions"],
  ["fill_blank", "Fill-blank questions"],
  ["short_answer", "Short-answer questions"],
] as const;

const difficultyCopy: Record<Difficulty, string> = {
  basic: "Core review",
  mixed: "Mixed practice",
  challenging: "Challenge mode",
};

export function UploadView({
  files,
  error,
  counts,
  custom,
  difficulty,
  loading,
  mistakeCount,
  sessionCount,
  materialCount,
  sessions,
  reviewFocusMaterials = [],
  onAcceptFiles,
  onCountsChange,
  onCustomChange,
  onDifficultyChange,
  onOpenMistakes,
  onOpenProgress,
  onOpenHistory,
  onOpenSession,
  onOpenMaterial,
  onStart,
}: {
  files: File[];
  error: string;
  counts: Record<string, number>;
  custom: CustomDraft[];
  difficulty: Difficulty;
  loading: boolean;
  mistakeCount: number;
  sessionCount: number;
  materialCount: number;
  sessions: StudySession[];
  reviewFocusMaterials?: StudyMaterial[];
  onAcceptFiles: (next?: FileList | File[]) => void;
  onCountsChange: (update: (previous: Record<string, number>) => Record<string, number>) => void;
  onCustomChange: (update: (previous: CustomDraft[]) => CustomDraft[]) => void;
  onDifficultyChange: (next: Difficulty) => void;
  onOpenMistakes: () => void;
  onOpenProgress: () => void;
  onOpenHistory: () => void;
  onOpenSession: (session: StudySession) => void;
  onOpenMaterial?: (material: StudyMaterial) => void;
  onStart: () => void;
}) {
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
            <div className="eyebrow">Quiz lab</div>
            <h2 id="start-quiz-heading">Start a new practice set.</h2>
            <p>Upload one or more PDFs, or a lecture recording, then configure your quiz.</p>
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
              aria-label="Choose a PDF or lecture recording"
              type="file"
              multiple
              accept="application/pdf,.pdf,audio/mpeg,audio/mp4,audio/x-m4a,audio/wav,audio/webm,video/mp4,.mp3,.m4a,.wav,.webm,.mp4"
              onChange={(event) => onAcceptFiles(event.target.files || undefined)}
            />
            <span className="upload-icon">Upload</span>
            {files.length ? (
              <>
                {files.map((file) => (
                  <strong key={`${file.name}-${file.size}`}>{file.name}</strong>
                ))}
                <span>
                  {isCombinedPdfSet
                    ? `${files.length} PDFs ready to generate together`
                    : `${formatBytes(files[0].size)} - Ready to generate`}
                </span>
              </>
            ) : (
              <>
                <strong>Drop in a PDF or lecture recording</strong>
                <span>PDF, MP3, M4A, WAV, WebM, or MP4</span>
              </>
            )}
          </label>
          {error && <div className="error-message">{error}</div>}
          <div className="settings-block">
            <div className="setting-heading">
              <span>Question mix</span>
              <small>Questions, answers, and explanations are generated in English.</small>
            </div>
            <div className="type-grid">
              {fixedTypes.map(([type, label]) => (
                <label key={type}>
                  {label}
                  <input
                    aria-label={label}
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
            {custom.map((item) => (
              <div className="custom-row" key={item.key}>
                <input
                  aria-label="Custom question type name"
                  value={item.label}
                  placeholder="Question type name"
                  onChange={(event) =>
                    onCustomChange((items) =>
                      items.map((value) =>
                        value.key === item.key ? { ...value, label: event.target.value } : value,
                      ),
                    )
                  }
                />
                <input
                  aria-label="Custom question requirements"
                  value={item.instructions}
                  placeholder="Requirements"
                  onChange={(event) =>
                    onCustomChange((items) =>
                      items.map((value) =>
                        value.key === item.key
                          ? { ...value, instructions: event.target.value }
                          : value,
                      ),
                    )
                  }
                />
                <input
                  aria-label="Custom question count"
                  min="1"
                  max="15"
                  type="number"
                  value={item.count}
                  onChange={(event) =>
                    onCustomChange((items) =>
                      items.map((value) =>
                        value.key === item.key
                          ? {
                              ...value,
                              count: Math.max(1, Math.min(15, Number(event.target.value) || 1)),
                            }
                          : value,
                      ),
                    )
                  }
                />
                <button
                  className="text-button"
                  onClick={() =>
                    onCustomChange((items) => items.filter((value) => value.key !== item.key))
                  }
                >
                  Remove
                </button>
              </div>
            ))}
            <button
              className="text-button"
              onClick={() =>
                onCustomChange((items) => [
                  ...items,
                  { key: crypto.randomUUID(), label: "", instructions: "", count: 1 },
                ])
              }
            >
              Add custom question type
            </button>
            <div className="segmented-control difficulty-control">
              {(Object.keys(difficultyCopy) as Difficulty[]).map((item) => (
                <button
                  key={item}
                  className={difficulty === item ? "is-active" : ""}
                  onClick={() => onDifficultyChange(item)}
                >
                  {difficultyCopy[item]}
                </button>
              ))}
            </div>
          </div>
          <button
            className="primary-button generate-button"
            disabled={!files.length || loading}
            onClick={onStart}
          >
            {needsTranscription
              ? "Transcribe recording"
              : isCombinedPdfSet
                ? "Generate combined quiz"
                : "Generate quiz"}
          </button>
          <p className="privacy-note">
            Large files pass through a temporary Vercel Blob and are deleted after processing. Your
            lecture is sent to OpenAI to build the quiz; PDFs may stay there for up to 7 days so
            grading and follow-up questions can reference them. Answers stay in this browser.
          </p>
        </div>
      </section>

      <section className="dashboard-shortcuts" aria-label="Study shortcuts">
        <button onClick={onOpenMistakes}>
          <span className="dashboard-shortcut-icon coral" aria-hidden="true">
            !
          </span>
          <span>
            <strong>Mistake Book</strong>
            <small>{mistakeCount} questions to revisit</small>
          </span>
          <b aria-hidden="true">-&gt;</b>
        </button>
        <button onClick={onOpenProgress}>
          <span className="dashboard-shortcut-icon mint" aria-hidden="true">
            C
          </span>
          <span>
            <strong>Calendar</strong>
            <small>{studyDayCount} recorded study days</small>
          </span>
          <b aria-hidden="true">-&gt;</b>
        </button>
        <button onClick={onOpenHistory}>
          <span className="dashboard-shortcut-icon blue" aria-hidden="true">
            H
          </span>
          <span>
            <strong>History</strong>
            <small>{materialCount} PDFs with saved questions</small>
          </span>
          <b aria-hidden="true">-&gt;</b>
        </button>
      </section>

      <section className="dashboard-details">
        {reviewFocusMaterials.length ? (
          <article className="dashboard-detail-card review-focus-card">
            <div className="dashboard-detail-heading">
              <div>
                <div className="eyebrow">Personalized review</div>
                <h2>Review focus</h2>
              </div>
              <span className="review-focus-count">{reviewFocusMaterials.length} PDF{reviewFocusMaterials.length === 1 ? "" : "s"}</span>
            </div>
            <p className="muted-copy">Open a PDF&apos;s review sheet to revisit the mistakes that matter most.</p>
            <div className="dashboard-session-list review-focus-list">
              {reviewFocusMaterials.slice(0, 3).map((material) => (
                <button
                  key={material.id || material.name}
                  onClick={() => onOpenMaterial?.(material)}
                  aria-label={`Open ${material.name} review`}
                >
                  <span>
                    <strong>{material.name}</strong>
                    <small>{material.mistakes.length} mistake{material.mistakes.length === 1 ? "" : "s"} to revisit</small>
                  </span>
                  <span aria-hidden="true">-&gt;</span>
                </button>
              ))}
            </div>
          </article>
        ) : null}
        <article className="dashboard-detail-card">
          <div className="dashboard-detail-heading">
            <h2>Recent practice</h2>
            <button className="text-button" onClick={onOpenHistory}>
              View all
            </button>
          </div>
          {recentSessions.length ? (
            <div className="dashboard-session-list">
              {recentSessions.map((session) => (
                <button key={session.id} onClick={() => onOpenSession(session)}>
                  <span>
                    <strong>{session.title}</strong>
                    <small>
                      {session.questions.length} question{session.questions.length === 1 ? "" : "s"}
                    </small>
                  </span>
                  <time dateTime={session.createdAt}>
                    {new Date(session.createdAt).toLocaleDateString()}
                  </time>
                </button>
              ))}
            </div>
          ) : (
            <p className="dashboard-empty">Your completed quizzes will appear here.</p>
          )}
        </article>
        <article className="dashboard-detail-card calendar-summary-card">
          <div className="dashboard-detail-heading">
            <h2>Your calendar</h2>
            <button className="text-button" onClick={onOpenProgress}>
              Open calendar
            </button>
          </div>
          <strong className="calendar-summary-number">{studyDayCount}</strong>
          <p>
            days with recorded practice. Your full calendar shows every study date and its saved
            quizzes.
          </p>
          <button className="primary-button" onClick={onOpenProgress}>
            View learning calendar
          </button>
        </article>
      </section>
    </section>
  );
}
