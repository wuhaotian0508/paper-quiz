import { boundedFileData, MAX_PDF_BYTES } from "@/lib/request-validation";

/**
 * Study material is uploaded to the OpenAI Files API once, at generation time, and
 * referenced by id afterwards. Grading a written answer and asking a follow-up both
 * need the source material, and re-sending a 20 MB PDF as base64 on every one of
 * those calls is the dominant cost and latency driver.
 */
export const SOURCE_FILE_ID_PATTERN = /^file[-_][A-Za-z0-9_-]{4,128}$/;

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
}): Promise<FilePart[]> {
  if (source.fileId) return [{ type: "input_file", file_id: source.fileId }];
  if (!source.file) return [];
  const data = await boundedFileData(source.file, MAX_PDF_BYTES);
  if (!data) return [];
  return [
    {
      type: "input_file",
      filename: source.file.name,
      file_data: `data:application/pdf;base64,${data}`,
      detail: "auto",
    },
  ];
}
