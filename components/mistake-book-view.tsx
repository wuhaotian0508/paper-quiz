"use client";

import { useMemo, useState } from "react";
import { downloadMistakesPdf } from "@/lib/pdf-export";
import type { MistakeBookEntry } from "@/lib/mistake-book";

type Filter = "all" | "multiple_choice" | "fill_blank" | "short_answer" | "custom";
type Props = {
  entries: MistakeBookEntry[];
  onBack: () => void;
  onChange: (entries: MistakeBookEntry[]) => void;
  onPractice: (entries: MistakeBookEntry[]) => void;
};
const labels: Record<Filter, string> = {
  all: "All",
  multiple_choice: "Multiple choice",
  fill_blank: "Fill blank",
  short_answer: "Short answer",
  custom: "Custom",
};

function answerText(entry: MistakeBookEntry) {
  const question = entry.question;
  if (question.type !== "multiple_choice") return question.referenceAnswer;
  return (
    question.options.find((option) => option.id === question.correctOptionId)?.text ||
    question.correctOptionId.toUpperCase()
  );
}

export function MistakeBookView({ entries, onBack, onChange, onPractice }: Props) {
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
          <div className="eyebrow">Mistake book</div>
          <h1>Turn misses into mastery.</h1>
          <p className="muted-copy">
            <strong>
              {entries.length} {entries.length === 1 ? "mistake" : "mistakes"}
            </strong>{" "}
            saved on this browser.
          </p>
        </div>
        <div className="mistake-primary-actions">
          <button
            className="primary-button"
            disabled={!entries.length}
            onClick={() => onPractice(entries)}
          >
            Practice all
          </button>
          <button
            className="text-button framed-button"
            disabled={!entries.length}
            onClick={() => downloadMistakesPdf(entries)}
          >
            Export PDF
          </button>
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
              {labels[value]}
              {value !== "all" && (
                <span>{entries.filter((entry) => entry.question.type === value).length}</span>
              )}
            </button>
          ))}
        </div>
        <div className="selection-actions">
          <span>{selected.length} selected</span>
          <button disabled={!selected.length} onClick={() => onPractice(selectedEntries)}>
            Practice selected
          </button>
          <button disabled={!selected.length} onClick={() => downloadMistakesPdf(selectedEntries)}>
            Export selected
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
                    aria-label={`Select question ${index + 1}`}
                    checked={selected.includes(entry.id)}
                    type="checkbox"
                    onChange={() => setSelected((values) => toggle(values, entry.id))}
                  />
                </label>
                <div className="mistake-type">
                  <span>{labels[entry.question.type]}</span>
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
                        <strong>Correct answer:</strong> {answerText(entry)}
                      </p>
                      <p>
                        <strong>Feedback:</strong> {entry.feedback}
                      </p>
                      <p>
                        <strong>Source:</strong> {entry.question.sourceNote}
                      </p>
                    </div>
                  )}
                  <button
                    className="detail-button"
                    onClick={() => setExpanded((values) => toggle(values, entry.id))}
                  >
                    {isExpanded ? "Hide details" : "View details"}
                  </button>
                </div>
                <div className="mistake-item-actions">
                  <button className="primary-button" onClick={() => onPractice([entry])}>
                    Practice again
                  </button>
                  <button
                    className="remove-button"
                    onClick={() => onChange(entries.filter((item) => item.id !== entry.id))}
                  >
                    Remove
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="mistake-empty">
          <h2>No mistakes in this filter.</h2>
          <p>Choose another question type or start a new practice set.</p>
        </div>
      )}
      <footer className="mistake-footer">
        <button className="text-button" onClick={onBack}>
          Back to upload
        </button>
        {entries.length > 0 && (
          <button
            className="danger-link"
            onClick={() => {
              if (window.confirm("Clear every saved mistake? This cannot be undone.")) onChange([]);
            }}
          >
            Clear all mistakes
          </button>
        )}
      </footer>
    </section>
  );
}
