"use client";

import { downloadWeaknessReviewPdf } from "@/lib/pdf-export";
import { buildWeaknessReviewSheet } from "@/lib/review-sheet";
import type { MistakeBookEntry } from "@/lib/mistake-book";

export function ReviewSheetView({
  entries,
  onBack,
  onPractice,
}: {
  entries: MistakeBookEntry[];
  onBack: () => void;
  onPractice: (entries: MistakeBookEntry[]) => void;
}) {
  const sheet = buildWeaknessReviewSheet(entries);
  const selected = entries.filter((entry) => sheet.items.some((item) => item.id === entry.id));

  return (
    <section className="review-sheet-page">
      <header className="mistake-heading">
        <div>
          <div className="eyebrow">Personal review sheet</div>
          <h1>Study what you have not mastered yet.</h1>
          <p className="muted-copy">Built from your saved mistakes. It summarizes learning gaps, not source files.</p>
        </div>
        <div className="mistake-primary-actions">
          <button className="primary-button" disabled={!selected.length} onClick={() => onPractice(selected)}>
            Practice these areas
          </button>
          <button className="text-button framed-button" disabled={!sheet.items.length} onClick={() => downloadWeaknessReviewPdf(sheet)}>
            Export one-page PDF
          </button>
        </div>
      </header>
      {sheet.items.length ? (
        <div className="review-sheet-list">
          {sheet.items.map((item, index) => (
            <article className="review-sheet-item" key={item.id}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <div>
                <h2>{item.prompt}</h2>
                <p><strong>Key answer:</strong> {item.keyAnswer}</p>
                <p><strong>Remember:</strong> {item.remember}</p>
                <small>{item.action}</small>
              </div>
            </article>
          ))}
        </div>
      ) : <p className="mistake-empty">Complete a quiz and save a missed question to build your first review sheet.</p>}
      <button className="text-button" onClick={onBack}>Back to mistake book</button>
    </section>
  );
}
