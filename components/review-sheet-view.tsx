"use client";

import { useEffect, useMemo, useState } from "react";
import { downloadWeaknessReviewPdf } from "@/lib/pdf-export";
import { buildWeaknessReviewSheet } from "@/lib/review-sheet";
import type { MistakeBookEntry } from "@/lib/mistake-book";
import {
  extractPageNumber,
  readSourcePageImages,
  SOURCE_PAGES_UPDATED_EVENT,
  type SourcePageImage,
} from "@/lib/source-pages";
import { useLocale } from "@/hooks/use-locale";

/** One rendered slide, keyed the way the sheet looks it up. */
const pageKey = (materialId: string, pageNumber: number) => `${materialId}:${pageNumber}`;

export function ReviewSheetView({
  entries,
  onBack,
  onPractice,
}: {
  entries: MistakeBookEntry[];
  onBack: () => void;
  onPractice: (entries: MistakeBookEntry[]) => void;
}) {
  const { t } = useLocale();
  const sheet = buildWeaknessReviewSheet(entries);
  const selected = entries.filter((entry) => sheet.items.some((item) => item.id === entry.id));
  const [sourcePages, setSourcePages] = useState<Map<string, SourcePageImage>>(new Map());
  const [previewPage, setPreviewPage] = useState<SourcePageImage | null>(null);

  // Weaknesses on one sheet can come from several PDFs, so every cited material is loaded
  // rather than the single material the exam review sheet works from.
  const materialIds = useMemo(
    () => [...new Set(sheet.items.map((item) => item.materialId).filter(Boolean))].sort(),
    // The id list is what matters, not the sheet identity it is rebuilt from on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sheet.items.map((item) => item.materialId).join("|")],
  );

  useEffect(() => {
    if (!materialIds.length) return;
    let active = true;
    const load = () => {
      void Promise.all(materialIds.map((materialId) => readSourcePageImages(materialId))).then(
        (loaded) => {
          if (!active) return;
          const next = new Map<string, SourcePageImage>();
          for (const pages of loaded) {
            for (const page of pages) next.set(pageKey(page.materialId, page.pageNumber), page);
          }
          setSourcePages(next);
        },
      );
    };
    load();
    const handleUpdate = (event: Event) => {
      if (materialIds.includes((event as CustomEvent<string>).detail)) load();
    };
    window.addEventListener(SOURCE_PAGES_UPDATED_EVENT, handleUpdate);
    return () => {
      active = false;
      window.removeEventListener(SOURCE_PAGES_UPDATED_EVENT, handleUpdate);
    };
  }, [materialIds]);

  useEffect(() => {
    if (!previewPage) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPreviewPage(null);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [previewPage]);

  const slideFor = (materialId: string, sourceNote: string) => {
    if (!materialId) return undefined;
    const pageNumber = extractPageNumber(sourceNote);
    return pageNumber ? sourcePages.get(pageKey(materialId, pageNumber)) : undefined;
  };
  // Only worth a column when at least one weakness can actually show its slide; otherwise the
  // sheet keeps its original full-width layout instead of reserving empty space.
  const hasAnySlide = sheet.items.some((item) => slideFor(item.materialId, item.sourceNote));

  return (
    <section className="review-sheet-page">
      <header className="mistake-heading">
        <div>
          <div className="eyebrow">{t("reviewSheet.eyebrow")}</div>
          <h1>{t("reviewSheet.heading")}</h1>
          <p className="muted-copy">{t("reviewSheet.note")}</p>
        </div>
        <div className="mistake-primary-actions">
          <button
            className="primary-button"
            disabled={!selected.length}
            onClick={() => onPractice(selected)}
          >
            {t("reviewSheet.practiceAreas")}
          </button>
          <button
            className="text-button framed-button"
            disabled={!sheet.items.length}
            onClick={() => void downloadWeaknessReviewPdf(sheet)}
          >
            {t("reviewSheet.exportOnePage")}
          </button>
        </div>
      </header>
      {sheet.items.length ? (
        <div className="review-sheet-list">
          {sheet.items.map((item, index) => {
            const slide = slideFor(item.materialId, item.sourceNote);
            return (
              <article className="review-sheet-item" key={item.id}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <div>
                  <h2>{item.prompt}</h2>
                  <p>
                    <strong>{t("reviewSheet.keyAnswer")}</strong> {item.keyAnswer}
                  </p>
                  <p>
                    <strong>{t("reviewSheet.remember")}</strong> {item.remember}
                  </p>
                  <small>{item.action}</small>
                </div>
                {hasAnySlide ? (
                  <aside
                    className="review-topic-source"
                    aria-label={t("reviewSheet.slideForAria", { prompt: item.prompt })}
                  >
                    {slide ? (
                      <>
                        <button
                          className="review-topic-preview"
                          aria-label={t("reviewSheet.enlargeSlideAria", {
                            page: slide.pageNumber,
                          })}
                          onClick={() => setPreviewPage(slide)}
                        >
                          {/* Local IndexedDB previews are data URLs; next/image cannot optimize them. */}
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={slide.imageUrl}
                            alt={t("reviewSheet.slideAlt", { page: slide.pageNumber })}
                            loading="lazy"
                          />
                        </button>
                        <small>{t("reviewSheet.pageLabel", { page: slide.pageNumber })}</small>
                      </>
                    ) : (
                      <small>{t("reviewSheet.slideUnavailable")}</small>
                    )}
                  </aside>
                ) : null}
              </article>
            );
          })}
        </div>
      ) : (
        <p className="mistake-empty">{t("reviewSheet.empty")}</p>
      )}
      {previewPage ? (
        <div
          className="source-page-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label={t("reviewSheet.slidePreviewAria", { page: previewPage.pageNumber })}
          onClick={() => setPreviewPage(null)}
        >
          <div className="source-page-lightbox-card" onClick={(event) => event.stopPropagation()}>
            <div>
              <div className="eyebrow">{t("reviewSheet.slideSource")}</div>
              <h2>{t("reviewSheet.pageLabel", { page: previewPage.pageNumber })}</h2>
            </div>
            <button
              className="text-button"
              aria-label={t("reviewSheet.closePreviewAria")}
              onClick={() => setPreviewPage(null)}
            >
              {t("material.close")}
            </button>
            {/* Local IndexedDB previews are data URLs; next/image cannot optimize them. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewPage.imageUrl}
              alt={t("reviewSheet.enlargedSlideAlt", { page: previewPage.pageNumber })}
            />
          </div>
        </div>
      ) : null}
      <button className="text-button" onClick={onBack}>
        {t("reviewSheet.back")}
      </button>
    </section>
  );
}
