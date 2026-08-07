"use client";

import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { loadSharedReview, type SharedReviewClient } from "@/lib/shared-review-client";
import { useLocale } from "@/hooks/use-locale";
import { ExamReviewSectionSchema } from "@/lib/exam-review";
import { extractPageNumber } from "@/lib/source-pages";
import { ReviewSheetSections } from "@/components/review-sheet-sections";

const ReviewSchema = z.object({
  slug: z.string().min(1),
  title: z.string().min(1),
  // The share RPC projects every field, so absent ones arrive as JSON null.
  subject: z.string().nullish(),
  scope: z.string().nullish(),
  goal: z.string().nullish(),
  sections: z.array(ExamReviewSectionSchema).nullish(),
  // Links published before the two-column layout carry a flat topic list instead.
  topics: z
    .array(
      z.object({
        topic: z.string().min(1),
        keyIdeas: z.array(z.string().min(1)),
        formulaOrProcedure: z.string(),
        commonConfusion: z.string().min(1),
        sourceNote: z.string().min(1),
        mistakeFocus: z.string(),
      }),
    )
    .nullish()
    .transform((value) => value ?? []),
  sourcePages: z
    .array(
      z.object({
        pageNumber: z.number().int().positive(),
        imageUrl: z.string().url().or(z.string().startsWith("data:image/")),
      }),
    )
    .optional(),
});

export function SharedReviewView({ slug, client }: { slug: string; client?: SharedReviewClient }) {
  const { t } = useLocale();
  const [review, setReview] = useState<z.infer<typeof ReviewSchema> | null>(null);
  const [message, setMessage] = useState(t("shared.loadingReview"));

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const resolvedClient =
          client ?? (getSupabaseBrowserClient() as unknown as SharedReviewClient);
        const data = ReviewSchema.parse(await loadSharedReview(resolvedClient, slug));
        if (!active) return;
        setReview(data);
        setMessage("");
      } catch (cause) {
        if (active)
          setMessage(cause instanceof Error ? cause.message : t("shared.reviewUnavailable"));
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [client, slug, t]);

  // Built before the early return so the hook order stays stable across loading and loaded.
  const slideForSourceNote = useMemo(() => {
    const byPage = new Map((review?.sourcePages ?? []).map((page) => [page.pageNumber, page]));
    return (sourceNote: string) => {
      const pageNumber = extractPageNumber(sourceNote);
      return pageNumber ? byPage.get(pageNumber) : undefined;
    };
  }, [review]);

  if (!review)
    return (
      <main className="shared-challenge-page">
        <p role="status">{message}</p>
      </main>
    );

  return (
    <main className="shared-challenge-page">
      <div className="eyebrow">{t("shared.reviewEyebrow")}</div>
      <h1>{review.title}</h1>
      <p className="muted-copy">{t("shared.reviewNote")}</p>
      <p className="shared-challenge-note">{t("shared.reviewPrivacy")}</p>
      <div className="shared-link-actions">
        <a
          className="text-button framed-button"
          href={`/login?returnTo=${encodeURIComponent(`/review/${review.slug}`)}`}
        >
          {t("shared.signIn")}
        </a>
        <a className="primary-button" href="#review-topics">
          {t("shared.useThisReview")}
        </a>
      </div>
      {review.sourcePages?.length ? (
        <section className="review-source-pages" aria-label={t("shared.sourcePagesAria")}>
          <div className="eyebrow">{t("shared.sourcePages")}</div>
          <p className="muted-copy">{t("shared.sourcePagesNote")}</p>
          <div className="review-source-page-grid">
            {review.sourcePages.map((page) => (
              <figure className="review-source-page" key={page.pageNumber}>
                {/* Shared previews are data URLs created from the learner's source PDF. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={page.imageUrl}
                  alt={t("shared.sourcePageAlt", { page: page.pageNumber })}
                  loading="lazy"
                />
                <figcaption>{t("shared.pageLabel", { page: page.pageNumber })}</figcaption>
              </figure>
            ))}
          </div>
        </section>
      ) : null}
      <div id="review-topics">
        <ReviewSheetSections sheet={review} slideFor={slideForSourceNote} />
      </div>
      <div className="review-sheet-list">
        {review.topics.map((topic, index) => (
          <article className="review-sheet-item" key={`${topic.topic}-${index}`}>
            <span>{String(index + 1).padStart(2, "0")}</span>
            <div>
              <h2>{topic.topic}</h2>
              <p>{topic.keyIdeas.join(" ")}</p>
              {topic.formulaOrProcedure ? (
                <p>
                  <strong>{t("shared.formulaOrProcedure")}</strong> {topic.formulaOrProcedure}
                </p>
              ) : null}
              <p>
                <strong>{t("shared.commonConfusion")}</strong> {topic.commonConfusion}
              </p>
              {topic.mistakeFocus ? (
                <p>
                  <strong>{t("shared.reviewFocus")}</strong> {topic.mistakeFocus}
                </p>
              ) : null}
              <small>{t("shared.sourceLabel", { note: topic.sourceNote })}</small>
            </div>
          </article>
        ))}
      </div>
    </main>
  );
}
