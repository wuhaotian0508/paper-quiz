import { boundedFileData } from "@/lib/request-validation";

/**
 * Study material is uploaded to the OpenAI Files API once, at generation time, and
 * referenced by id afterwards. Grading a written answer and asking a follow-up both
 * need the source material, and re-sending a 20 MB PDF as base64 on every one of
 * those calls is the dominant cost and latency driver.
 */
export const SOURCE_FILE_ID_PATTERN = /^file[-_][A-Za-z0-9_-]{4,128}$/;
export const MAX_SOURCE_FILES = 5;

/** Files expire on their own so abandoned uploads do not accumulate at the provider. */
export const SOURCE_FILE_TTL_SECONDS = 60 * 60 * 24 * 7;

export type SourceFileUploader = {
  files: {
    create: (input: {
      file: File;
      purpose: "user_data";
      expires_after: { anchor: "created_at"; seconds: number };
    }) => Promise<{ id: string }>;
  };
};

export function parseSourceFileId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return SOURCE_FILE_ID_PATTERN.test(trimmed) ? trimmed : null;
}

/** Accepts the compact form payload used when a quiz is grounded in several PDFs. */
export function parseSourceFileIds(value: unknown): string[] | null {
  if (typeof value !== "string") return null;
  try {
    const ids: unknown = JSON.parse(value);
    if (!Array.isArray(ids) || ids.length < 1 || ids.length > MAX_SOURCE_FILES) return null;
    const parsed = ids.map(parseSourceFileId);
    return parsed.every((id): id is string => Boolean(id)) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Returns null instead of throwing: a gateway pointed at by OPENAI_BASE_URL need not
 * proxy /v1/files, and callers fall back to inlining the file for that one request.
 */
export async function uploadSourceFile(
  client: SourceFileUploader,
  file: File,
): Promise<string | null> {
  try {
    const uploaded = await client.files.create({
      file,
      purpose: "user_data",
      expires_after: { anchor: "created_at", seconds: SOURCE_FILE_TTL_SECONDS },
    });
    return parseSourceFileId(uploaded.id);
  } catch {
    return null;
  }
}

/**
 * Uploads each selected PDF independently so a provider failure can fall back to
 * inline bytes for just that document rather than discarding the whole quiz request.
 */
export async function uploadSourceFiles(
  client: SourceFileUploader,
  files: File[],
): Promise<(string | null)[]> {
  return Promise.all(files.map((file) => uploadSourceFile(client, file)));
}

type FilePart =
  | { type: "input_file"; file_id: string }
  | { type: "input_file"; filename: string; file_data: string; detail: "auto" };

/**
 * Prefers the stored file id; falls back to inlining the file when the client still
 * holds it and no id was ever issued. Returns [] for transcript-only sources.
 */
export async function buildSourceFileParts(source: {
  fileId?: string | null;
  file?: File | null;
  fileIds?: (string | null)[];
  files?: File[];
}): Promise<FilePart[]> {
  const files = source.files || (source.file ? [source.file] : []);
  const ids = source.fileIds || (source.fileId ? [source.fileId] : []);
  const count = Math.max(files.length, ids.length);
  const parts: FilePart[] = [];

  for (let index = 0; index < count; index += 1) {
    const id = ids[index];
    if (id) {
      parts.push({ type: "input_file", file_id: id });
      continue;
    }
    const file = files[index];
    if (!file) continue;
    const data = await boundedFileData(file);
    if (!data) continue;
    parts.push({
      type: "input_file",
      filename: file.name,
      file_data: `data:application/pdf;base64,${data}`,
      detail: "auto",
    });
  }

  return parts;
}
