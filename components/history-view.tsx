"use client";

import type { StudyMaterial } from "@/lib/study-material";

export function HistoryView({
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
      <div className="eyebrow">PDF history</div>
      <h1>Your PDF question history.</h1>
      {materials.length ? (
        <p className="muted-copy">
          Every PDF keeps its saved questions, mistakes, and practice sessions together.
        </p>
      ) : null}
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
                  {material.questions.length} saved question
                  {material.questions.length === 1 ? "" : "s"} - {material.mistakes.length} mistake
                  {material.mistakes.length === 1 ? "" : "s"} - {material.sessions.length} practice
                  set
                  {material.sessions.length === 1 ? "" : "s"}
                </small>
              </span>
              <button className="text-button" onClick={() => onOpen(material)}>
                Open PDF
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="muted-copy">
          Generate a quiz from a PDF or recording and its saved questions will appear here.
        </p>
      )}
      <div className="quiz-actions">
        <button className="text-button" onClick={onBack}>
          Back to dashboard
        </button>
      </div>
    </section>
  );
}
