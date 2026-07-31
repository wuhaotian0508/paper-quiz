import { z } from "zod";

export const MAX_TRANSCRIPT_CHARS = 120_000;
export const MAX_ANSWER_CHARS = 12_000;
export const MAX_MESSAGE_CHARS = 2_000;
export const MAX_HISTORY_MESSAGES = 8;
export const MAX_QUESTION_CHARS = 50_000;

const ChatMessageSchema = z
  .object({
    role: z.enum(["user", "assistant"]),
    content: z.string().trim().min(1).max(MAX_MESSAGE_CHARS),
  })
  .strict();

export type ChatMessage = z.infer<typeof ChatMessageSchema>;

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

export function safeStorageSet(
  key: string,
  value: string,
  storage: Storage = window.localStorage,
): boolean {
  try {
    storage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}
