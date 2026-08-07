"use client";

import { useLocale } from "@/hooks/use-locale";

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
  const { t } = useLocale();
  return (
    <section className="transcript-card">
      <div className="eyebrow">{t("transcript.eyebrow")}</div>
      <h1>{t("transcript.heading")}</h1>
      <label className="transcript-field">
        {t("transcript.label")}
        <textarea
          aria-label={t("transcript.label")}
          value={transcript}
          onChange={(event) => onChange(event.target.value)}
          rows={15}
        />
      </label>
      <div className="quiz-actions">
        <button className="text-button" onClick={onBack}>
          {t("transcript.chooseAnother")}
        </button>
        <button className="primary-button" disabled={!transcript.trim()} onClick={onGenerate}>
          {t("transcript.generate")}
        </button>
      </div>
    </section>
  );
}
