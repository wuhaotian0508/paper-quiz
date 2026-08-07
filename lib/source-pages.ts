import { normalizeMaterialId } from "@/lib/study-history";

export type SourcePageImage = {
  materialId: string;
  pageNumber: number;
  imageUrl: string;
};

const DB_NAME = "paper-plane-quiz-source-pages-v1";
const DB_VERSION = 2;
const STORE_NAME = "pages";
const PDF_STORE_NAME = "pdfs";
const MAX_RENDERED_PAGES = 60;
const MAX_REVIEW_TRANSCRIPT_CHARS = 110_000;
export const SOURCE_PAGES_UPDATED_EVENT = "paper-quiz-source-pages-updated";

export function extractPageNumber(sourceNote: string): number | null {
  const match = sourceNote.match(/(?:page|pages|slide|slides|p\.?|第)\s*([0-9]{1,4})\s*(?:页)?/i);
  if (!match) return null;
  const page = Number(match[1]);
  return Number.isInteger(page) && page > 0 ? page : null;
}

export function dedupeSourcePages(pages: SourcePageImage[]): SourcePageImage[] {
  const seen = new Set<number>();
  return [...pages]
    .sort((left, right) => left.pageNumber - right.pageNumber)
    .filter((page) => {
      if (seen.has(page.pageNumber)) return false;
      seen.add(page.pageNumber);
      return true;
    });
}

function openDatabase(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME))
        db.createObjectStore(STORE_NAME, { keyPath: ["materialId", "pageNumber"] });
      if (!db.objectStoreNames.contains(PDF_STORE_NAME))
        db.createObjectStore(PDF_STORE_NAME, { keyPath: "materialId" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error || new Error("Source page storage is unavailable."));
  });
}

/** Stores the learner-selected original locally so cited pages can reopen after a refresh. */
export async function storeSourcePdf(
  file: File,
  materialId: string,
  transcript = "",
): Promise<void> {
  try {
    const db = await openDatabase();
    if (!db) return;
    await new Promise<void>((resolve, reject) => {
      const request = db
        .transaction(PDF_STORE_NAME, "readwrite")
        .objectStore(PDF_STORE_NAME)
        .put({ materialId, file, name: file.name, type: file.type, transcript });
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch {
    // The currently selected file still works if IndexedDB storage is unavailable.
  }
}

export async function readSourcePdf(materialId: string): Promise<File | null> {
  const stored = await readStoredSourcePdf(materialId);
  if (!stored?.file) return null;
  return new File([stored.file], stored.name || "source.pdf", {
    type: stored.type || stored.file.type || "application/pdf",
  });
}

export async function readSourcePdfTranscript(materialId: string): Promise<string> {
  return (await readStoredSourcePdf(materialId))?.transcript || "";
}

type StoredSourcePdf = { file?: Blob; name?: string; type?: string; transcript?: string };

async function readStoredSourcePdf(materialId: string): Promise<StoredSourcePdf | null> {
  try {
    const db = await openDatabase();
    if (!db) return null;
    const stored = await new Promise<StoredSourcePdf | undefined>((resolve, reject) => {
      // Scanned rather than fetched by key: pages stored before material ids dropped the
      // byte size are still filed under `name::size`, and a keyed get would miss them,
      // silently losing the slides for every PDF already in the library.
      const request = db
        .transaction(PDF_STORE_NAME, "readonly")
        .objectStore(PDF_STORE_NAME)
        .getAll();
      request.onsuccess = () =>
        resolve(
          (request.result as (StoredSourcePdf & { materialId?: string })[]).find(
            (item) => normalizeMaterialId(item.materialId || "") === materialId,
          ),
        );
      request.onerror = () => reject(request.error);
    });
    return stored || null;
  } catch {
    return null;
  }
}

export async function readSourcePageImages(materialId: string): Promise<SourcePageImage[]> {
  try {
    const db = await openDatabase();
    if (!db) return [];
    return await new Promise((resolve, reject) => {
      const request = db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).getAll();
      request.onsuccess = () =>
        resolve(
          dedupeSourcePages(
            // Matched on the normalized id so slides rendered under the older `name::size`
            // id keep resolving; `dedupeSourcePages` then collapses a page rendered twice.
            (request.result as SourcePageImage[]).filter(
              (page) => normalizeMaterialId(page.materialId) === materialId,
            ),
          ),
        );
      request.onerror = () => reject(request.error);
    });
  } catch {
    return [];
  }
}

/**
 * Prepares one browser-local source package: page previews for the UI and a
 * bounded, page-labelled transcript for review generation. Keeping the text
 * local until the learner asks for a review avoids depending on short-lived
 * provider file IDs while preserving page-level citations.
 */
export async function renderAndStorePdfPages(file: File, materialId: string): Promise<string> {
  if (typeof window === "undefined" || typeof document === "undefined") return "";
  try {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/legacy/build/pdf.worker.min.mjs",
      import.meta.url,
    ).toString();
    const pdf = await pdfjs.getDocument({
      data: new Uint8Array(await file.arrayBuffer()),
    }).promise;
    const db = await openDatabase();
    if (!db) return "";
    const count = Math.min(pdf.numPages, MAX_RENDERED_PAGES);
    const perPageTextBudget = Math.max(
      1,
      Math.floor((MAX_REVIEW_TRANSCRIPT_CHARS - count * 16) / count),
    );
    const transcriptPages: string[] = [];
    for (let pageNumber = 1; pageNumber <= count; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1.25 });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const renderTask = page.render({ canvas, viewport }).promise;
      const textContent = await page.getTextContent();
      await renderTask;
      const imageUrl = canvas.toDataURL("image/jpeg", 0.78);
      const pageText = textContent.items
        .map((item) => ("str" in item ? item.str : ""))
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      if (pageText)
        transcriptPages.push(`Page ${pageNumber}:\n${pageText.slice(0, perPageTextBudget)}`);
      await new Promise<void>((resolve, reject) => {
        const request = db
          .transaction(STORE_NAME, "readwrite")
          .objectStore(STORE_NAME)
          .put({ materialId, pageNumber, imageUrl });
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    }
    window.dispatchEvent(new CustomEvent(SOURCE_PAGES_UPDATED_EVENT, { detail: materialId }));
    return transcriptPages.join("\n\n");
  } catch {
    // A page preview is an enhancement; generation and saved questions must still work.
    return "";
  }
}
