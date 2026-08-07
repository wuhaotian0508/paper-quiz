"use client";

import { buildMaterialReviewSheet } from "@/lib/material-review-sheet";
import type { StudyLibraryRecord } from "@/lib/study-library";
import type { StudyMaterial } from "@/lib/study-material";

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
          <div className="eyebrow">Review sheets</div>
          <h2 id="review-library-heading">Your review sheets by document</h2>
          <p>Each PDF has its own library, practice history, and personalized review sheet.</p>
        </div>
        <div className="review-library-controls">
          <label>
            <span className="sr-only">Sort review sheets</span>
            <select aria-label="Sort review sheets" defaultValue="recent">
              <option value="recent">Recently updated</option>
              <option value="name">Name</option>
            </select>
          </label>
          <span className="review-library-view-toggle" aria-label="Grid view selected">
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
                    <small>{lastDate ? `Last practiced ${new Date(lastDate).toLocaleDateString()}` : "Uploaded recently"}</small>
                  </div>
                  <button className="review-library-menu" aria-label={`More options for ${material.name}`} type="button">
                    ⋮
                  </button>
                </div>
                <div className="review-library-stats">
                  <span><strong>{review.weaknesses.length}</strong><small>Weak concepts</small></span>
                  <span><strong>{material.mistakes.length}</strong><small>Mistakes</small></span>
                  <span className="review-library-mastery"><strong>{mastery}%</strong><small>Mastery</small></span>
                </div>
                <button
                  aria-label={`Open ${material.name} review sheet`}
                  className="review-library-open"
                  onClick={() => onOpen(material)}
                  type="button"
                >
                  Open Review Sheet <span aria-hidden="true">→</span>
                </button>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="review-library-empty">
          <strong>Your PDF libraries will appear here.</strong>
          <span>Upload a PDF and complete a practice set to generate its first review sheet.</span>
        </div>
      )}

      {ordered.length ? (
        <button className="review-library-view-all" onClick={onViewAll} type="button">
          View all review sheets <span aria-hidden="true">→</span>
        </button>
      ) : null}
    </section>
  );
}
