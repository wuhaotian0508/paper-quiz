"use client";

import { useMemo, useState } from "react";
import { downloadProgressPdf } from "@/lib/pdf-export";
import {
  getSessionAccuracy,
  groupSessionsByDate,
  sessionDateKey,
  type StudySession,
} from "@/lib/study-history";

type Props = {
  sessions: StudySession[];
  onBack: () => void;
  onOpen: (session: StudySession) => void;
};

export function ProgressDashboard({ sessions, onBack, onOpen }: Props) {
  const initial = sessions[0]
    ? sessionDateKey(sessions[0].createdAt)
    : sessionDateKey(new Date().toISOString());
  const [selectedDate, setSelectedDate] = useState(initial);
  const selected = new Date(`${selectedDate}T12:00:00`);
  const grouped = useMemo(() => groupSessionsByDate(sessions), [sessions]);
  const firstDay = new Date(selected.getFullYear(), selected.getMonth(), 1);
  const daysInMonth = new Date(selected.getFullYear(), selected.getMonth() + 1, 0).getDate();
  const cells = [
    ...Array(firstDay.getDay()).fill(null),
    ...Array.from({ length: daysInMonth }, (_, index) => index + 1),
  ];
  const dateKey = (day: number) =>
    `${selected.getFullYear()}-${String(selected.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const recent = [...sessions].reverse().slice(-10);

  return (
    <section className="progress-page">
      <div className="progress-heading">
        <div>
          <div className="eyebrow">Progress</div>
          <h1>Practice tells a story.</h1>
          <p className="muted-copy">
            First-attempt results and daily study activity stored on this browser.
          </p>
        </div>
        <button
          className="primary-button"
          disabled={!sessions.length}
          onClick={() => downloadProgressPdf(sessions)}
        >
          Export progress PDF
        </button>
      </div>
      <div className="progress-grid">
        <article className="progress-card">
          <h2>Accuracy trend</h2>
          <div className="trend-chart">
            {recent.length ? (
              recent.map((session) => (
                <div className="trend-column" key={session.id}>
                  <span style={{ height: `${Math.max(6, getSessionAccuracy(session))}%` }} />
                  <small>{getSessionAccuracy(session)}%</small>
                </div>
              ))
            ) : (
              <p className="muted-copy">Complete a quiz to start the curve.</p>
            )}
          </div>
        </article>
        <article className="progress-card calendar-card">
          <div className="calendar-title">
            <button
              onClick={() =>
                setSelectedDate(
                  sessionDateKey(
                    new Date(selected.getFullYear(), selected.getMonth() - 1, 1).toISOString(),
                  ),
                )
              }
            >
              Previous
            </button>
            <h2>{selected.toLocaleString("en", { month: "long", year: "numeric" })}</h2>
            <button
              onClick={() =>
                setSelectedDate(
                  sessionDateKey(
                    new Date(selected.getFullYear(), selected.getMonth() + 1, 1).toISOString(),
                  ),
                )
              }
            >
              Next
            </button>
          </div>
          <div className="calendar-week">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
              <span key={day}>{day}</span>
            ))}
          </div>
          <div className="calendar-grid">
            {cells.map((day, index) =>
              day ? (
                <button
                  className={`${selectedDate === dateKey(day) ? "is-selected" : ""} ${grouped[dateKey(day)] ? "has-practice" : ""}`}
                  key={dateKey(day)}
                  onClick={() => setSelectedDate(dateKey(day))}
                >
                  <strong>{day}</strong>
                  {grouped[dateKey(day)] && <span>{grouped[dateKey(day)].length}</span>}
                </button>
              ) : (
                <span key={`blank-${index}`} />
              ),
            )}
          </div>
        </article>
      </div>
      <article className="progress-card daily-sessions">
        <h2>{selected.toLocaleDateString()} practice</h2>
        {(grouped[selectedDate] || []).length ? (
          grouped[selectedDate].map((session) => (
            <button className="session-card" key={session.id} onClick={() => onOpen(session)}>
              <span>
                <strong>{session.title}</strong>
                <small>{session.questions.length} questions</small>
              </span>
              <b>{getSessionAccuracy(session)}%</b>
            </button>
          ))
        ) : (
          <p className="muted-copy">No completed practice recorded for this day.</p>
        )}
      </article>
      <button className="text-button" onClick={onBack}>
        Back to upload
      </button>
    </section>
  );
}
