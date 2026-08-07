import type { jsPDF } from "jspdf";

/**
 * jsPDF only ships Latin faces, so Chinese text silently exports as garbage unless a
 * CJK face is embedded. The subset in `public/fonts` covers GB2312 plus the Latin and
 * punctuation ranges the exam template needs, and is fetched on demand so English-only
 * exports never pay for it.
 */
export const PDF_CJK_FONT = "PaperQuizSC";

const FONT_FILES = { normal: "PaperQuizSC-Regular.ttf", bold: "PaperQuizSC-Bold.ttf" } as const;

export type PdfFontData = { normal: string; bold: string };

const CJK_PATTERN = /[⺀-〿㐀-䶿一-鿿豈-﫿＀-￯]/;

export function containsCjk(text: string): boolean {
  return CJK_PATTERN.test(text);
}

function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  // Multi-megabyte fonts overflow the argument limit when spread in one call.
  const chunkSize = 0x8000;
  let binary = "";
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}

async function fetchFont(file: string): Promise<string> {
  const response = await fetch(`/fonts/${file}`);
  if (!response.ok) throw new Error(`${file} responded with ${response.status}`);
  return toBase64(await response.arrayBuffer());
}

let pending: Promise<PdfFontData | null> | null = null;

/** Resolves to null when the face cannot be fetched, so export falls back to Latin. */
export function loadPdfFontData(): Promise<PdfFontData | null> {
  pending ??= Promise.all([fetchFont(FONT_FILES.normal), fetchFont(FONT_FILES.bold)])
    .then(([normal, bold]) => ({ normal, bold }))
    .catch((error: unknown) => {
      console.error("Chinese PDF font failed to load", error);
      pending = null;
      return null;
    });
  return pending;
}

/** Registers the face on one document. Returns whether Chinese text is now printable. */
export function registerPdfFont(pdf: jsPDF, data: PdfFontData | null): boolean {
  if (!data) return false;
  pdf.addFileToVFS(FONT_FILES.normal, data.normal);
  pdf.addFont(FONT_FILES.normal, PDF_CJK_FONT, "normal");
  pdf.addFileToVFS(FONT_FILES.bold, data.bold);
  pdf.addFont(FONT_FILES.bold, PDF_CJK_FONT, "bold");
  return true;
}
