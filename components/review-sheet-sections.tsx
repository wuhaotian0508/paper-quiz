"use client";

import { useLocale } from "@/hooks/use-locale";
import {
  orderedReviewSections,
  REVIEW_FULL_WIDTH,
  REVIEW_LEFT_COLUMN,
  REVIEW_RIGHT_COLUMN,
  reviewSectionsFor,
  type ExamReviewSection,
  type ExamReviewSheet,
} from "@/lib/exam-review";

type SheetLike = Pick<ExamReviewSheet, "subject" | "scope" | "goal" | "sections">;

/** The slide a section cites, or undefined when it is not available to this view. */
export type SectionSlide = { pageNumber: number; imageUrl: string };

/**
 * The two-column revision sheet: numbered sections down a left and right column, then
 * the plan strip across the full width. Mirrors the printed PDF so the screen and the
 * export read the same. Renders nothing for sheets saved before this layout.
 *
 * `slideFor` is optional so the same component serves the material page, which reads slides
 * from this browser's IndexedDB, and a shared link, which carries them in its payload.
 */
export function ReviewSheetSections({
  sheet,
  slideFor,
  onPreviewSlide,
}: {
  sheet: SheetLike;
  slideFor?: (sourceNote: string) => SectionSlide | undefined;
  onPreviewSlide?: (slide: SectionSlide) => void;
}) {
  const { t } = useLocale();
  if (!sheet.sections?.length) return null;

  const full = sheet as ExamReviewSheet;
  const banner = [
    sheet.subject ? { label: t("review.subject"), value: sheet.subject } : null,
    sheet.scope ? { label: t("review.scope"), value: sheet.scope } : null,
    sheet.goal ? { label: t("review.goal"), value: sheet.goal } : null,
  ].filter((entry): entry is { label: string; value: string } => entry !== null);

  const bannerRow = banner.map((entry) => (
    <span key={entry.label}>
      <strong>{entry.label}</strong> {entry.value}
    </span>
  ));

  const slideOf = (section: ExamReviewSection) =>
    section.sourceNote ? slideFor?.(section.sourceNote) : undefined;

  const slideFigure = (section: ExamReviewSection, slide: SectionSlide) => (
    <figure className="review-section-slide">
      <button
        className="review-topic-preview"
        disabled={!onPreviewSlide}
        aria-label={t("review.enlargeSlideAria", {
          page: slide.pageNumber,
          heading: section.heading,
        })}
        onClick={() => onPreviewSlide?.(slide)}
      >
        {/* Slides are data URLs, from IndexedDB or a share payload; not optimizable. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={slide.imageUrl}
          alt={t("review.slideAlt", { page: slide.pageNumber, heading: section.heading })}
          loading="lazy"
        />
      </button>
      <figcaption>{t("review.pageLabel", { page: slide.pageNumber })}</figcaption>
    </figure>
  );

  const body = (section: ExamReviewSection, number: number) => (
    <>
      <h2>
        <span className="review-sheet-number">{number}</span>
        {section.heading}
      </h2>
      <ul>
        {section.items.map((item, index) => (
          <li key={index}>
            {item.label ? <strong>{item.label}</strong> : null}
            <span>{item.body}</span>
          </li>
        ))}
      </ul>
    </>
  );

  const column = (kinds: typeof REVIEW_LEFT_COLUMN) =>
    reviewSectionsFor(full, kinds).map(({ section, number }) => (
      <section className="review-sheet-section" key={section.kind}>
        {body(section, number)}
      </section>
    ));

  // With slides available the sheet reads as pairs — a knowledge point, then the slide it came
  // from — so it runs as one column. Two narrow columns would put each slide beside unrelated
  // text instead of under its own point. Without slides the printed two-column layout stands.
  const paired = orderedReviewSections(full)
    .map((entry) => ({ ...entry, slide: slideOf(entry.section) }))
    .filter((entry) => entry.slide);

  if (paired.length)
    return (
      <div className="review-sheet-page">
        {banner.length ? <div className="review-sheet-banner">{bannerRow}</div> : null}
        <div className="review-sheet-paired">
          {orderedReviewSections(full).map(({ section, number }) => {
            const slide = slideOf(section);
            return (
              <section className="review-sheet-section" key={section.kind}>
                {body(section, number)}
                {slide ? slideFigure(section, slide) : null}
              </section>
            );
          })}
        </div>
      </div>
    );

  return (
    <div className="review-sheet-page">
      {banner.length ? (
        <div className="review-sheet-banner">
          {banner.map((entry) => (
            <span key={entry.label}>
              <strong>{entry.label}</strong> {entry.value}
            </span>
          ))}
        </div>
      ) : null}
      <div className="review-sheet-columns">
        <div>{column(REVIEW_LEFT_COLUMN)}</div>
        <div>{column(REVIEW_RIGHT_COLUMN)}</div>
      </div>
      <div className="review-sheet-full">{column(REVIEW_FULL_WIDTH)}</div>
    </div>
  );
}
