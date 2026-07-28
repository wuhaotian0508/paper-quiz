"use client";

export function TranscriptReviewView({
  transcript,
  onChange,
  onBack,
  onGenerate,
}: {
  transcript: string;
  onChange: (value: string) => void;
  onBack: () => void;
  onGenerate: () => void;
}) {
  return (
    <section className="transcript-card">
      <div className="eyebrow">Transcript review</div>
      <h1>Check the lecture notes before building your quiz.</h1>
      <label className="transcript-field">
        Lecture transcript
        <textarea
          aria-label="Lecture transcript"
          value={transcript}
          onChange={(event) => onChange(event.target.value)}
          rows={15}
        />
      </label>
      <div className="quiz-actions">
        <button className="text-button" onClick={onBack}>
          Choose another study file
        </button>
        <button className="primary-button" disabled={!transcript.trim()} onClick={onGenerate}>
          Generate quiz from transcript
        </button>
      </div>
    </section>
  );
}
