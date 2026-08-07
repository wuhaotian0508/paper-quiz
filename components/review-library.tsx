"use client";

import { buildMaterialReviewSheet } from "@/lib/material-review-sheet";
import type { StudyLibraryRecord } from "@/lib/study-library";
import type { StudyMaterial } from "@/lib/study-material";
import { useLocale } from "@/hooks/use-locale";

const tones = ["violet", "mint", "blue", "coral"] as const;

export function ReviewLibrary({
  materials,
  library,
  onOpen,
  onViewAll,
}: {
  materials: StudyMaterial[];
  library: StudyLibraryRecord[];
  onOpen: (material: StudyMaterial) => void;
  onViewAll: () => void;
}) {
  const { t } = useLocale();
  const libraryById = new Map(library.map((item) => [item.id, item]));
  const ordered = [...materials].sort((left, right) => {
    const leftDate = left.lastPracticedAt || libraryById.get(left.id)?.lastOpenedAt || libraryById.get(left.id)?.uploadedAt || "";
    const rightDate = right.lastPracticedAt || libraryById.get(right.id)?.lastOpenedAt || libraryById.get(right.id)?.uploadedAt || "";
    return rightDate.localeCompare(leftDate);
  });

  return (
    <section className="review-library" aria-labelledby="review-library-heading">
      <div className="review-library-heading">
        <div>
          <div className="eyebrow">{t("reviewLibrary.eyebrow")}</div>
          <h2 id="review-library-heading">{t("reviewLibrary.heading")}</h2>
          <p>{t("reviewLibrary.note")}</p>
        </div>
        <div className="review-library-controls">
          <label>
            <span className="sr-only">{t("reviewLibrary.sortAria")}</span>
            <select aria-label={t("reviewLibrary.sortAria")} defaultValue="recent">
              <option value="recent">{t("reviewLibrary.sortRecent")}</option>
              <option value="name">{t("reviewLibrary.sortName")}</option>
            </select>
          </label>
          <span className="review-library-view-toggle" aria-label={t("reviewLibrary.gridViewAria")}>
            ▦
          </span>
          <span className="review-library-view-toggle is-muted" aria-hidden="true">
            ≡
          </span>
        </div>
      </div>

      {ordered.length ? (
        <div className="review-library-grid">
          {ordered.map((material, index) => {
            const review = buildMaterialReviewSheet(material);
            const grades = material.sessions.flatMap((session) => Object.values(session.grades));
            const mastery = grades.length
              ? Math.round((grades.filter((grade) => grade.status === "correct").length / grades.length) * 100)
              : 0;
            const libraryItem = libraryById.get(material.id);
            const lastDate = material.lastPracticedAt || libraryItem?.uploadedAt || "";
            return (
              <article className={`review-library-card tone-${tones[index % tones.length]}`} key={material.id || material.name}>
                <div className="review-library-card-topline">
                  <span className="review-library-file-icon" aria-hidden="true">PDF</span>
                  <div>
                    <strong>{material.name}</strong>
                    <small>
                      {lastDate
                        ? t("reviewLibrary.lastPracticed", {
                            date: new Date(lastDate).toLocaleDateString(),
                          })
                        : t("reviewLibrary.uploadedRecently")}
                    </small>
                  </div>
                  <button
                    className="review-library-menu"
                    aria-label={t("reviewLibrary.moreOptionsAria", { name: material.name })}
                    type="button"
                  >
                    ⋮
                  </button>
                </div>
                <div className="review-library-stats">
                  <span><strong>{review.weaknesses.length}</strong><small>{t("reviewLibrary.weakConcepts")}</small></span>
                  <span><strong>{material.mistakes.length}</strong><small>{t("reviewLibrary.mistakes")}</small></span>
                  <span className="review-library-mastery"><strong>{mastery}%</strong><small>{t("reviewLibrary.mastery")}</small></span>
                </div>
                <button
                  aria-label={t("reviewLibrary.openSheetAria", { name: material.name })}
                  className="review-library-open"
                  onClick={() => onOpen(material)}
                  type="button"
                >
                  {t("reviewLibrary.openSheet")} <span aria-hidden="true">→</span>
                </button>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="review-library-empty">
          <strong>{t("reviewLibrary.emptyHeading")}</strong>
          <span>{t("reviewLibrary.emptyBody")}</span>
        </div>
      )}

      {ordered.length ? (
        <button className="review-library-view-all" onClick={onViewAll} type="button">
          {t("reviewLibrary.viewAll")} <span aria-hidden="true">→</span>
        </button>
      ) : null}
    </section>
  );
}
