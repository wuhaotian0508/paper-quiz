"use client";

import type { DailyReviewPaper } from "@/lib/daily-review";
import type { MistakeBookEntry } from "@/lib/mistake-book";
import { useLocale } from "@/hooks/use-locale";

type Props = {
  papers: DailyReviewPaper[];
  onSit: (entries: MistakeBookEntry[]) => void;
};

/**
 * Today's papers, one per course. Rendered on the dashboard as the first thing a returning
 * student sees, because a review plan nobody opens is not a plan.
 *
 * Sitting a paper re-uses the stored questions rather than generating new ones: it costs no
 * API call, works offline, and asks the exact question that was missed — which is what the
 * forgetting curve is scheduling.
 */
export function DailyReviewPapers({ papers, onSit }: Props) {
  const { t } = useLocale();

  if (!papers.length) {
    return (
      <section className="daily-review daily-review-clear" aria-labelledby="daily-review-heading">
        <h2 id="daily-review-heading">{t("daily.heading")}</h2>
        <p className="muted-copy">{t("daily.allClear")}</p>
      </section>
    );
  }

  return (
    <section className="daily-review" aria-labelledby="daily-review-heading">
      <div className="daily-review-heading">
        <h2 id="daily-review-heading">{t("daily.heading")}</h2>
        <p className="muted-copy">{t("daily.note")}</p>
      </div>
      <div className="daily-review-list">
        {papers.map((paper) => (
          <article className="daily-review-card" key={paper.subject || "unassigned"}>
            <div className="daily-review-card-head">
              <strong>{paper.subject || t("daily.unassigned")}</strong>
              {paper.overdueCount ? (
                <span className="daily-review-overdue">
                  {t("daily.behind", { count: paper.overdueCount })}
                </span>
              ) : null}
            </div>
            <p className="daily-review-count">
              {t("daily.questionCount", { count: paper.entries.length })}
              {paper.dueCount > paper.entries.length ? (
                <small>{t("daily.heldBack", { count: paper.dueCount - paper.entries.length })}</small>
              ) : null}
            </p>
            <button className="primary-button" onClick={() => onSit(paper.entries)} type="button">
              {t("daily.start")}
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}
