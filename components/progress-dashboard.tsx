"use client";

import { useMemo, useState } from "react";
import { downloadProgressPdf } from "@/lib/pdf-export";
import {
  getSessionAccuracy,
  groupSessionsByDate,
  sessionDateKey,
  type StudySession,
} from "@/lib/study-history";
import { useLocale } from "@/hooks/use-locale";
import type { MessageKey } from "@/lib/i18n";

const weekdayKeys: MessageKey[] = [
  "progress.sun",
  "progress.mon",
  "progress.tue",
  "progress.wed",
  "progress.thu",
  "progress.fri",
  "progress.sat",
];

type Props = {
  sessions: StudySession[];
  onBack: () => void;
  onOpen: (session: StudySession) => void;
};

export function ProgressDashboard({ sessions, onBack, onOpen }: Props) {
  const { locale, t } = useLocale();
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
          <div className="eyebrow">{t("progress.eyebrow")}</div>
          <h1>{t("progress.heading")}</h1>
          <p className="muted-copy">{t("progress.note")}</p>
        </div>
        <button
          className="primary-button"
          disabled={!sessions.length}
          onClick={() => downloadProgressPdf(sessions)}
        >
          {t("progress.exportPdf")}
        </button>
      </div>
      <div className="progress-grid">
        <article className="progress-card">
          <h2>{t("progress.accuracyTrend")}</h2>
          <div className="trend-chart">
            {recent.length ? (
              recent.map((session) => (
                <div className="trend-column" key={session.id}>
                  <span style={{ height: `${Math.max(6, getSessionAccuracy(session))}%` }} />
                  <small>{getSessionAccuracy(session)}%</small>
                </div>
              ))
            ) : (
              <p className="muted-copy">{t("progress.trendEmpty")}</p>
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
              {t("progress.previous")}
            </button>
            <h2>
              {selected.toLocaleString(locale === "zh" ? "zh-CN" : "en", {
                month: "long",
                year: "numeric",
              })}
            </h2>
            <button
              onClick={() =>
                setSelectedDate(
                  sessionDateKey(
                    new Date(selected.getFullYear(), selected.getMonth() + 1, 1).toISOString(),
                  ),
                )
              }
            >
              {t("progress.next")}
            </button>
          </div>
          <div className="calendar-week">
            {weekdayKeys.map((key) => (
              <span key={key}>{t(key)}</span>
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
        <h2>{t("progress.dayPractice", { date: selected.toLocaleDateString() })}</h2>
        {(grouped[selectedDate] || []).length ? (
          grouped[selectedDate].map((session) => (
            <button className="session-card" key={session.id} onClick={() => onOpen(session)}>
              <span>
                <strong>{session.title}</strong>
                <small>{t("progress.questionCount", { count: session.questions.length })}</small>
              </span>
              <b>{getSessionAccuracy(session)}%</b>
            </button>
          ))
        ) : (
          <p className="muted-copy">{t("progress.dayEmpty")}</p>
        )}
      </article>
      <button className="text-button" onClick={onBack}>
        {t("progress.back")}
      </button>
    </section>
  );
}
