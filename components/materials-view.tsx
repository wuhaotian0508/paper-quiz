"use client";

import type { StudyMaterial } from "@/lib/study-material";
import { useLocale } from "@/hooks/use-locale";

export function MaterialsView({
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
      <div className="eyebrow">{t("materials.eyebrow")}</div>
      <h1>{t("materials.heading")}</h1>
      {materials.length ? (
        <>
          <p className="muted-copy">{t("materials.note")}</p>
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
                    {" "}
                    {t(
                      material.questions.length === 1
                        ? "materials.questionOne"
                        : "materials.questionOther",
                      { count: material.questions.length },
                    )}{" "}
                    -{" "}
                    {t(
                      material.mistakes.length === 1
                        ? "materials.mistakeOne"
                        : "materials.mistakeOther",
                      { count: material.mistakes.length },
                    )}{" "}
                    -{" "}
                    {t(material.sessions.length === 1 ? "materials.setOne" : "materials.setOther", {
                      count: material.sessions.length,
                    })}
                  </small>
                </span>
                <button className="text-button" onClick={() => onOpen(material)}>
                  {t("materials.open")}
                </button>
              </div>
            ))}
          </div>
        </>
      ) : (
        <p className="muted-copy">{t("materials.empty")}</p>
      )}
      <div className="quiz-actions">
        <button className="text-button" onClick={onBack}>
          {t("materials.back")}
        </button>
      </div>
    </section>
  );
}
