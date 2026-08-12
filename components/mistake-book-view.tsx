"use client";

import { useMemo, useState } from "react";
import { downloadMistakesPdf } from "@/lib/pdf-export";
import type { MistakeBookEntry } from "@/lib/mistake-book";
import { correctAnswerText } from "@/lib/quiz";
import { QuestionReport } from "@/components/question-report";
import { useLocale } from "@/hooks/use-locale";
import type { MessageKey } from "@/lib/i18n";

type Filter = "all" | "multiple_choice" | "fill_blank" | "short_answer" | "custom";
type Props = {
  entries: MistakeBookEntry[];
  onBack: () => void;
  onChange: (entries: MistakeBookEntry[]) => void;
  onPractice: (entries: MistakeBookEntry[]) => void;
  onReview?: () => void;
};
const labels: Record<Filter, MessageKey> = {
  all: "mistakes.filterAll",
  multiple_choice: "mistakes.filterMultipleChoice",
  fill_blank: "mistakes.filterFillBlank",
  short_answer: "mistakes.filterShortAnswer",
  custom: "mistakes.filterCustom",
};

const answerText = (entry: MistakeBookEntry) => correctAnswerText(entry.question);

export function MistakeBookView({ entries, onBack, onChange, onPractice, onReview }: Props) {
  const { t } = useLocale();
  const [filter, setFilter] = useState<Filter>("all");
  const [selected, setSelected] = useState<string[]>([]);
  const [expanded, setExpanded] = useState<string[]>([]);
  const visible = useMemo(
    () => entries.filter((entry) => filter === "all" || entry.question.type === filter),
    [entries, filter],
  );
  const selectedEntries = entries.filter((entry) => selected.includes(entry.id));
  const toggle = (values: string[], id: string) =>
    values.includes(id) ? values.filter((value) => value !== id) : [...values, id];

  return (
    <section className="mistake-page" id="mistake-book">
      <header className="mistake-heading">
        <div>
          <div className="eyebrow">{t("mistakes.eyebrow")}</div>
          <h1>{t("mistakes.heading")}</h1>
          <p className="muted-copy">
            <strong>
              {t(entries.length === 1 ? "mistakes.savedCountOne" : "mistakes.savedCountOther", {
                count: entries.length,
              })}
            </strong>{" "}
            {t("mistakes.savedOnBrowser")}
          </p>
        </div>
        <div className="mistake-primary-actions">
          <button
            className="primary-button"
            disabled={!entries.length}
            onClick={() => onPractice(entries)}
          >
            {t("mistakes.practiceAll")}
          </button>
          <button
            className="text-button framed-button"
            disabled={!entries.length}
            onClick={() => void downloadMistakesPdf(entries)}
          >
            {t("mistakes.exportPdf")}
          </button>
          {onReview ? (
            <button
              className="text-button framed-button"
              disabled={!entries.length}
              onClick={onReview}
            >
              {t("mistakes.buildReviewSheet")}
            </button>
          ) : null}
        </div>
      </header>
      <div className="mistake-toolbar">
        <div className="filter-pills">
          {(Object.keys(labels) as Filter[]).map((value) => (
            <button
              className={filter === value ? "is-active" : ""}
              key={value}
              onClick={() => setFilter(value)}
            >
              {t(labels[value])}
              {value !== "all" && (
                <span>{entries.filter((entry) => entry.question.type === value).length}</span>
              )}
            </button>
          ))}
        </div>
        <div className="selection-actions">
          <span>{t("mistakes.selectedCount", { count: selected.length })}</span>
          <button disabled={!selected.length} onClick={() => onPractice(selectedEntries)}>
            {t("mistakes.practiceSelected")}
          </button>
          <button
            disabled={!selected.length}
            onClick={() => void downloadMistakesPdf(selectedEntries)}
          >
            {t("mistakes.exportSelected")}
          </button>
        </div>
      </div>
      {visible.length ? (
        <div className="mistake-list">
          {visible.map((entry, index) => {
            const isExpanded = expanded.includes(entry.id);
            return (
              <article className="mistake-item" key={entry.id}>
                <label className="mistake-select">
                  <input
                    aria-label={t("mistakes.selectQuestionAria", { number: index + 1 })}
                    checked={selected.includes(entry.id)}
                    type="checkbox"
                    onChange={() => setSelected((values) => toggle(values, entry.id))}
                  />
                </label>
                <div className="mistake-type">
                  <span>{t(labels[entry.question.type])}</span>
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
                        <strong>{t("mistakes.correctAnswer")}</strong> {answerText(entry)}
                      </p>
                      <p>
                        <strong>{t("mistakes.feedback")}</strong> {entry.feedback}
                      </p>
                      <p>
                        <strong>{t("mistakes.source")}</strong> {entry.question.sourceNote}
                      </p>
                      {/* A wrongly-marked question hurts most here, where the schedule keeps
                          bringing it back. Reporting it is next to Remove for that reason. */}
                      <QuestionReport
                        question={entry.question}
                        materialName={entry.source.materialName}
                        source={entry.source}
                      />
                    </div>
                  )}
                  <button
                    className="detail-button"
                    onClick={() => setExpanded((values) => toggle(values, entry.id))}
                  >
                    {isExpanded ? t("mistakes.hideDetails") : t("mistakes.viewDetails")}
                  </button>
                </div>
                <div className="mistake-item-actions">
                  <button className="primary-button" onClick={() => onPractice([entry])}>
                    {t("mistakes.practiceAgain")}
                  </button>
                  <button
                    className="remove-button"
                    onClick={() => onChange(entries.filter((item) => item.id !== entry.id))}
                  >
                    {t("mistakes.remove")}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="mistake-empty">
          <h2>{t("mistakes.emptyHeading")}</h2>
          <p>{t("mistakes.emptyBody")}</p>
        </div>
      )}
      <footer className="mistake-footer">
        <button className="text-button" onClick={onBack}>
          {t("mistakes.backToUpload")}
        </button>
        {entries.length > 0 && (
          <button
            className="danger-link"
            onClick={() => {
              if (window.confirm(t("mistakes.clearConfirm"))) onChange([]);
            }}
          >
            {t("mistakes.clearAll")}
          </button>
        )}
      </footer>
    </section>
  );
}
