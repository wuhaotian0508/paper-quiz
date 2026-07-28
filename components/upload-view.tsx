"use client";

import type { Difficulty } from "@/lib/quiz";
import { formatBytes, isAudio } from "@/lib/study-file";

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
  file,
  error,
  counts,
  custom,
  difficulty,
  loading,
  mistakeCount,
  sessionCount,
  onAcceptFile,
  onCountsChange,
  onCustomChange,
  onDifficultyChange,
  onOpenMistakes,
  onOpenProgress,
  onOpenHistory,
  onStart,
}: {
  file: File | null;
  error: string;
  counts: Record<string, number>;
  custom: CustomDraft[];
  difficulty: Difficulty;
  loading: boolean;
  mistakeCount: number;
  sessionCount: number;
  onAcceptFile: (next?: File) => void;
  onCountsChange: (update: (previous: Record<string, number>) => Record<string, number>) => void;
  onCustomChange: (update: (previous: CustomDraft[]) => CustomDraft[]) => void;
  onDifficultyChange: (next: Difficulty) => void;
  onOpenMistakes: () => void;
  onOpenProgress: () => void;
  onOpenHistory: () => void;
  onStart: () => void;
}) {
  const needsTranscription = Boolean(file && isAudio(file));

  return (
    <section className="upload-layout">
      <div className="hero-copy">
        <div className="eyebrow">PDF + AUDIO -&gt; QUIZ LAB</div>
        <h1>
          Turn a lecture into a quiz, <em>then start practicing.</em>
        </h1>
        <p>
          Choose the question formats you need, then build grounded practice from your PDF or
          lecture recording.
        </p>
        <button className="text-button" onClick={onOpenMistakes}>
          Open mistake book ({mistakeCount})
        </button>
        <button className="text-button" onClick={onOpenProgress}>
          Progress and calendar ({sessionCount})
        </button>
        <button className="text-button" onClick={onOpenHistory}>
          Resume a practice set ({sessionCount})
        </button>
      </div>
      <div className="upload-panel">
        <label
          className="drop-zone"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            onAcceptFile(event.dataTransfer.files[0]);
          }}
        >
          <input
            aria-label="Choose a PDF or lecture recording"
            type="file"
            accept="application/pdf,.pdf,audio/mpeg,audio/mp4,audio/x-m4a,audio/wav,audio/webm,video/mp4,.mp3,.m4a,.wav,.webm,.mp4"
            onChange={(event) => onAcceptFile(event.target.files?.[0])}
          />
          <span className="upload-icon">Upload</span>
          {file ? (
            <>
              <strong>{file.name}</strong>
              <span>{formatBytes(file.size)} - Ready to generate</span>
            </>
          ) : (
            <>
              <strong>Drop in a PDF or lecture recording</strong>
              <span>MP3, M4A, WAV, WebM, or MP4 - up to 20 MB</span>
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
          disabled={!file || loading}
          onClick={onStart}
        >
          {needsTranscription ? "Transcribe recording" : "Generate quiz"}
        </button>
        <p className="privacy-note">
          Your lecture is sent to OpenAI to build the quiz. A PDF is stored there for up to 7 days
          so grading and follow-up questions can reference it, then deleted automatically. This site
          keeps your answers only in this browser.
        </p>
      </div>
    </section>
  );
}
