"use client";

import type { StudyMaterial } from "@/lib/study-material";

export function MaterialsView({
  materials,
  onBack,
  onOpen,
}: {
  materials: StudyMaterial[];
  onBack: () => void;
  onOpen: (material: StudyMaterial) => void;
}) {
  return (
    <section className="results-card">
      <div className="eyebrow">Study materials</div>
      <h1>Every lecture you have practiced.</h1>
      {materials.length ? (
        <>
          <p className="muted-copy">
            Grouped by the file you uploaded. Only the 30 most recent practice sets are kept in this
            browser.
          </p>
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
                    {material.questions.length} question
                    {material.questions.length === 1 ? "" : "s"} - {material.mistakes.length}{" "}
                    mistake{material.mistakes.length === 1 ? "" : "s"} - {material.sessions.length}{" "}
                    set{material.sessions.length === 1 ? "" : "s"}
                  </small>
                </span>
                <button className="text-button" onClick={() => onOpen(material)}>
                  Open
                </button>
              </div>
            ))}
          </div>
        </>
      ) : (
        <p className="muted-copy">
          Generate a quiz from a PDF or recording and it will show up here, grouped by file.
        </p>
      )}
      <div className="quiz-actions">
        <button className="text-button" onClick={onBack}>
          Back to upload
        </button>
      </div>
    </section>
  );
}
