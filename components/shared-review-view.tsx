"use client";

import { useEffect, useState } from "react";
import { z } from "zod";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { loadSharedReview, type SharedReviewClient } from "@/lib/shared-review-client";

const ReviewSchema = z.object({
  slug: z.string().min(1),
  title: z.string().min(1),
  topics: z.array(
    z.object({
      topic: z.string().min(1),
      keyIdeas: z.array(z.string().min(1)),
      formulaOrProcedure: z.string(),
      commonConfusion: z.string().min(1),
      sourceNote: z.string().min(1),
      mistakeFocus: z.string(),
    }),
  ),
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
  const [review, setReview] = useState<z.infer<typeof ReviewSchema> | null>(null);
  const [message, setMessage] = useState("Loading review...");

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const resolvedClient = client ?? (getSupabaseBrowserClient() as unknown as SharedReviewClient);
        const data = ReviewSchema.parse(await loadSharedReview(resolvedClient, slug));
        if (!active) return;
        setReview(data);
        setMessage("");
      } catch (cause) {
        if (active) setMessage(cause instanceof Error ? cause.message : "This review is unavailable.");
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [client, slug]);

  if (!review) return <main className="shared-challenge-page"><p role="status">{message}</p></main>;

  return (
    <main className="shared-challenge-page">
      <div className="eyebrow">Paper Plane Quiz review</div>
      <h1>{review.title}</h1>
      <p className="muted-copy">A read-only review sheet generated from the shared study material.</p>
      <p className="shared-challenge-note">This link shares review notes and selected page previews, never the original PDF or private answer records.</p>
      <div className="shared-link-actions">
        <a className="text-button framed-button" href={`/login?returnTo=${encodeURIComponent(`/review/${review.slug}`)}`}>
          Sign in
        </a>
        <a className="primary-button" href="#review-topics">
          Use this review
        </a>
      </div>
      {review.sourcePages?.length ? (
        <section className="review-source-pages" aria-label="Source pages">
          <div className="eyebrow">Source pages</div>
          <p className="muted-copy">The supporting PDF/PPT pages are shown in source order.</p>
          <div className="review-source-page-grid">
            {review.sourcePages.map((page) => (
              <figure className="review-source-page" key={page.pageNumber}>
                {/* Shared previews are data URLs created from the learner's source PDF. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={page.imageUrl} alt={`Source page ${page.pageNumber}`} loading="lazy" />
                <figcaption>Page {page.pageNumber}</figcaption>
              </figure>
            ))}
          </div>
        </section>
      ) : null}
      <div className="review-sheet-list" id="review-topics">
        {review.topics.map((topic, index) => (
          <article className="review-sheet-item" key={`${topic.topic}-${index}`}>
            <span>{String(index + 1).padStart(2, "0")}</span>
            <div>
              <h2>{topic.topic}</h2>
              <p>{topic.keyIdeas.join(" ")}</p>
              {topic.formulaOrProcedure ? <p><strong>Formula or procedure:</strong> {topic.formulaOrProcedure}</p> : null}
              <p><strong>Common confusion:</strong> {topic.commonConfusion}</p>
              {topic.mistakeFocus ? <p><strong>Review focus:</strong> {topic.mistakeFocus}</p> : null}
              <small>Source: {topic.sourceNote}</small>
            </div>
          </article>
        ))}
      </div>
    </main>
  );
}
