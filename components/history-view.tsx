"use client";

import type { StudyMaterial } from "@/lib/study-material";
import { useLocale } from "@/hooks/use-locale";

export function HistoryView({
  materials,
  onBack,
  onOpen,
}: {
  materials: StudyMaterial[];
  onBack: () => void;
  onOpen: (material: StudyMaterial) => void;
}) {
  const { t } = useLocale();
  return (
    <section className="results-card">
      <div className="eyebrow">{t("history.eyebrow")}</div>
      <h1>{t("history.heading")}</h1>
      {materials.length ? <p className="muted-copy">{t("history.note")}</p> : null}
      {materials.length ? (
        <div className="review-list">
          {materials.map((material) => (
            <div className="review-row" key={material.id || "ungrouped"}>
              <span className="review-number">
                {material.lastPracticedAt
                  ? new Date(material.lastPracticedAt).toLocaleDateString()
                  : "-"}
              </span>
              <span>
                <strong>{material.name}</strong>
                <small>
                  {t(
                    material.questions.length === 1
                      ? "history.savedQuestionOne"
                      : "history.savedQuestionOther",
                    { count: material.questions.length },
                  )}{" "}
                  -{" "}
                  {t(material.mistakes.length === 1 ? "history.mistakeOne" : "history.mistakeOther", {
                    count: material.mistakes.length,
                  })}{" "}
                  -{" "}
                  {t(material.sessions.length === 1 ? "history.setOne" : "history.setOther", {
                    count: material.sessions.length,
                  })}
                </small>
              </span>
              <button className="text-button" onClick={() => onOpen(material)}>
                {t("history.openPdf")}
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="muted-copy">{t("history.empty")}</p>
      )}
      <div className="quiz-actions">
        <button className="text-button" onClick={onBack}>
          {t("history.back")}
        </button>
      </div>
    </section>
  );
}
