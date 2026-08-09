"use client";

import { useMemo, useState } from "react";
import { downloadProgressPdf } from "@/lib/pdf-export";
import type { MistakeBookEntry } from "@/lib/mistake-book";
import {
  dueEntries,
  forecastDueCounts,
  REVIEW_INTERVAL_DAYS,
  reviewDateKey,
} from "@/lib/review-schedule";
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
  mistakes: MistakeBookEntry[];
  onBack: () => void;
  onOpen: (session: StudySession) => void;
  onReview: (entries: MistakeBookEntry[]) => void;
};

export function ProgressDashboard({ sessions, mistakes, onBack, onOpen, onReview }: Props) {
  const { locale, t } = useLocale();
  // Opens on today rather than the newest session: the calendar now answers "what do I owe",
  // and that question is always about today. Pinned for the component's lifetime so the
  // memos below are not invalidated by a fresh `Date` on every render.
  const today = useMemo(() => new Date(), []);
  const todayKey = reviewDateKey(today);
  const [selectedDate, setSelectedDate] = useState(todayKey);
  const selected = new Date(`${selectedDate}T12:00:00`);
  const grouped = useMemo(() => groupSessionsByDate(sessions), [sessions]);
  /** What is scheduled, by day. Past-due cards all land on today's cell. */
  const dueByDate = useMemo(() => forecastDueCounts(mistakes, today), [mistakes, today]);
  const dueOnSelected = useMemo(
    () => (selectedDate === todayKey ? dueEntries(mistakes, today) : []),
    [mistakes, selectedDate, today, todayKey],
  );
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
          onClick={() => void downloadProgressPdf(sessions)}
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
            {cells.map((day, index) => {
              if (!day) return <span key={`blank-${index}`} />;
              const key = dateKey(day);
              const practised = grouped[key]?.length ?? 0;
              const due = dueByDate[key] ?? 0;
              return (
                <button
                  className={[
                    selectedDate === key ? "is-selected" : "",
                    practised ? "has-practice" : "",
                    due ? "has-due" : "",
                    key === todayKey ? "is-today" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  key={key}
                  onClick={() => setSelectedDate(key)}
                >
                  <strong>{day}</strong>
                  {/* Two separate layers: what was practised, and what is owed. */}
                  {practised ? <span className="calendar-practised">{practised}</span> : null}
                  {due ? (
                    <span className="calendar-due" title={t("progress.dueCount", { count: due })}>
                      {due}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
          {/* Reviewers could see the numbers but not what drove them; the ladder is read
              from the schedule itself so the copy cannot drift from the behaviour. */}
          <details className="curve-explainer">
            <summary>{t("progress.curveTitle")}</summary>
            <p>{t("progress.curveWhat", { days: REVIEW_INTERVAL_DAYS.join(", ") })}</p>
            <ul>
              <li>{t("progress.curveCorrect")}</li>
              <li>{t("progress.curveWrong")}</li>
              <li>{t("progress.curveDone", { last: REVIEW_INTERVAL_DAYS.length })}</li>
            </ul>
            <p className="curve-legend">
              <span className="calendar-practised">1</span> {t("progress.curveLegendPractised")}
              <span className="calendar-due">1</span> {t("progress.curveLegendDue")}
            </p>
            <p>{t("progress.curveWhy")}</p>
          </details>
        </article>
      </div>
      <article className="progress-card daily-sessions">
        {dueOnSelected.length ? (
          <div className="progress-due-banner">
            <span>{t("progress.dueToday", { count: dueOnSelected.length })}</span>
            <button className="primary-button" onClick={() => onReview(dueOnSelected)}>
              {t("progress.startReview")}
            </button>
          </div>
        ) : null}
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
