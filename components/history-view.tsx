"use client";

import type { StudySession } from "@/lib/study-history";

export function HistoryView({
  sessions,
  onBack,
  onOpen,
}: {
  sessions: StudySession[];
  onBack: () => void;
  onOpen: (session: StudySession) => void;
}) {
  return (
    <section className="results-card">
      <div className="eyebrow">Study history</div>
      <h1>Your previous practice sets.</h1>
      {sessions.length ? (
        <div className="review-list">
          {sessions.map((session) => (
            <div className="review-row" key={session.id}>
              <span className="review-number">
                {new Date(session.createdAt).toLocaleDateString()}
              </span>
              <span>{session.title}</span>
              <button className="text-button" onClick={() => onOpen(session)}>
                Open
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="muted-copy">
          Generated quizzes will appear here after you complete or leave them.
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
