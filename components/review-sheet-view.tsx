"use client";

import { downloadWeaknessReviewPdf } from "@/lib/pdf-export";
import { buildWeaknessReviewSheet } from "@/lib/review-sheet";
import type { MistakeBookEntry } from "@/lib/mistake-book";
import { useLocale } from "@/hooks/use-locale";

export function ReviewSheetView({
  entries,
  onBack,
  onPractice,
}: {
  entries: MistakeBookEntry[];
  onBack: () => void;
  onPractice: (entries: MistakeBookEntry[]) => void;
}) {
  const { t } = useLocale();
  const sheet = buildWeaknessReviewSheet(entries);
  const selected = entries.filter((entry) => sheet.items.some((item) => item.id === entry.id));

  return (
    <section className="review-sheet-page">
      <header className="mistake-heading">
        <div>
          <div className="eyebrow">{t("reviewSheet.eyebrow")}</div>
          <h1>{t("reviewSheet.heading")}</h1>
          <p className="muted-copy">{t("reviewSheet.note")}</p>
        </div>
        <div className="mistake-primary-actions">
          <button
            className="primary-button"
            disabled={!selected.length}
            onClick={() => onPractice(selected)}
          >
            {t("reviewSheet.practiceAreas")}
          </button>
          <button
            className="text-button framed-button"
            disabled={!sheet.items.length}
            onClick={() => downloadWeaknessReviewPdf(sheet)}
          >
            {t("reviewSheet.exportOnePage")}
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
                <p>
                  <strong>{t("reviewSheet.keyAnswer")}</strong> {item.keyAnswer}
                </p>
                <p>
                  <strong>{t("reviewSheet.remember")}</strong> {item.remember}
                </p>
                <small>{item.action}</small>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <p className="mistake-empty">{t("reviewSheet.empty")}</p>
      )}
      <button className="text-button" onClick={onBack}>
        {t("reviewSheet.back")}
      </button>
    </section>
  );
}
