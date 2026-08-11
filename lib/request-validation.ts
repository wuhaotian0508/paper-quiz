import { z } from "zod";

export const MAX_TRANSCRIPT_CHARS = 120_000;
export const MAX_ANSWER_CHARS = 12_000;
export const MAX_MESSAGE_CHARS = 2_000;
export const MAX_HISTORY_MESSAGES = 8;
export const MAX_QUESTION_CHARS = 50_000;
/**
 * The learner-memory block is built client-side under a 600-character budget; the extra
 * headroom covers the block's own heading without letting a tampered request use memory
 * as a way to smuggle a large prompt past the other limits.
 */
export const MAX_MEMORY_CHARS = 1_200;
export const MAX_REVIEW_MISTAKES = 20;
const MAX_REVIEW_MISTAKE_CHARS = 2_000;

/**
 * A free-text note the learner writes before generating a quiz or a review sheet: "focus
 * on chapter 3", "keep the wording simple", "cover the case study, not the theory".
 *
 * Bounded well below the transcript limit because it is pasted straight into the prompt
 * alongside the output contract, and a brief long enough to bury that contract would cost
 * the quiz or sheet its shape.
 */
export const MAX_GENERATION_BRIEF_CHARS = 500;

/**
 * Truncates rather than rejecting: an over-long brief is a learner typing too much, not a
 * malformed request, and losing the whole generation over it would be the wrong trade.
 */
export function parseGenerationBrief(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, MAX_GENERATION_BRIEF_CHARS);
}

const ChatMessageSchema = z
  .object({
    role: z.enum(["user", "assistant"]),
    content: z.string().trim().min(1).max(MAX_MESSAGE_CHARS),
  })
  .strict();

export type ChatMessage = z.infer<typeof ChatMessageSchema>;

const ReviewMistakeContextSchema = z
  .object({
    id: z.string().trim().min(1).max(200),
    prompt: z.string().trim().min(1).max(MAX_REVIEW_MISTAKE_CHARS),
    answer: z.string().trim().max(MAX_REVIEW_MISTAKE_CHARS),
    referenceAnswer: z.string().trim().min(1).max(MAX_REVIEW_MISTAKE_CHARS),
    feedback: z.string().trim().min(1).max(MAX_REVIEW_MISTAKE_CHARS),
    status: z.enum(["partial", "incorrect"]),
    sourceNote: z.string().trim().min(1).max(300),
  })
  .strict();

export type ReviewMistakeContext = z.infer<typeof ReviewMistakeContextSchema>;

export function parseReviewMistakeContext(
  raw: unknown,
): { ok: true; value: ReviewMistakeContext[] } | { ok: false; error: string } {
  if (typeof raw !== "string" || raw.length > MAX_REVIEW_MISTAKES * 8_000)
    return { ok: false, error: "Review mistakes are invalid." };
  try {
    return {
      ok: true,
      value: z.array(ReviewMistakeContextSchema).max(MAX_REVIEW_MISTAKES).parse(JSON.parse(raw)),
    };
  } catch {
    return { ok: false, error: "Review mistakes are invalid." };
  }
}

export function parseChatHistory(
  raw: string,
): { ok: true; value: ChatMessage[] } | { ok: false; error: string } {
  if (raw.length > MAX_HISTORY_MESSAGES * (MAX_MESSAGE_CHARS + 40)) {
    return { ok: false, error: "Chat history is invalid." };
  }
  try {
    const value = z.array(ChatMessageSchema).max(MAX_HISTORY_MESSAGES).parse(JSON.parse(raw));
    return { ok: true, value };
  } catch {
    return { ok: false, error: "Chat history is invalid." };
  }
}

export function readBoundedText(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed && trimmed.length <= max ? trimmed : null;
}

export function validatePdfFile(file: File): { valid: true } | { valid: false; error: string } {
  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
    return { valid: false, error: "Only PDF files are supported." };
  }
  return { valid: true };
}

export async function boundedFileData(
  file: File,
  maxBytes = Number.POSITIVE_INFINITY,
): Promise<string | null> {
  if (file.size > maxBytes) return null;
  return Buffer.from(await file.arrayBuffer()).toString("base64");
}

/**
 * Announced when a browser refuses a write, which in practice means the origin's storage
 * quota is full. Every call site treated the `false` return as "nothing to do", so a full
 * quota silently stopped saving history, the library and the mistake book while the UI
 * carried on showing the in-memory copy. One listener on this event covers all of them, and
 * any call site added later.
 */
export const STORAGE_WRITE_FAILED_EVENT = "paper-quiz-storage-write-failed";

export function safeStorageSet(
  key: string,
  value: string,
  storage: Storage = window.localStorage,
): boolean {
  try {
    storage.setItem(key, value);
    return true;
  } catch {
    if (typeof window !== "undefined")
      window.dispatchEvent(new CustomEvent(STORAGE_WRITE_FAILED_EVENT, { detail: key }));
    return false;
  }
}
