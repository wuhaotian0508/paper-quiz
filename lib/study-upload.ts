import { upload } from "@vercel/blob/client";

const DIRECT_UPLOAD_BYTES = 4 * 1024 * 1024;
const BLOB_HOST_SUFFIX = ".blob.vercel-storage.com";

export const STUDY_CONTENT_TYPES = [
  "application/pdf",
  "audio/mpeg",
  "audio/mp4",
  "audio/x-m4a",
  "audio/wav",
  "audio/x-wav",
  "audio/webm",
  "video/mp4",
];

export function isTrustedStudyBlobUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname.endsWith(BLOB_HOST_SUFFIX);
  } catch {
    return false;
  }
}

type UploadStudyFile = typeof upload;
type StudyBlob = { url: string; name: string; type: string };

const isStudyBlob = (value: unknown): value is StudyBlob =>
  Boolean(
    value &&
      typeof value === "object" &&
      isTrustedStudyBlobUrl((value as StudyBlob).url) &&
      typeof (value as StudyBlob).name === "string" &&
      typeof (value as StudyBlob).type === "string",
  );

export async function attachStudyFile(
  form: FormData,
  file: File,
  uploader: UploadStudyFile = upload,
): Promise<void> {
  if (file.size <= DIRECT_UPLOAD_BYTES) {
    form.set("file", file);
    return;
  }

  const blob = await uploader(`study/${file.name}`, file, {
    access: "public",
    handleUploadUrl: "/api/study-upload",
    contentType: file.type || undefined,
    multipart: true,
  });
  form.set("blobUrl", blob.url);
  form.set("fileName", file.name);
  form.set("fileType", file.type);
}

/**
 * Sends small PDFs in the request and stages only oversized PDFs in Blob storage.
 * The array order is retained so source file names and returned provider ids line up.
 */
export async function attachStudyFiles(
  form: FormData,
  files: File[],
  uploader: UploadStudyFile = upload,
): Promise<void> {
  const blobs: StudyBlob[] = [];
  for (const file of files) {
    if (file.size <= DIRECT_UPLOAD_BYTES) {
      form.append("files", file);
      continue;
    }
    const blob = await uploader(`study/${file.name}`, file, {
      access: "public",
      handleUploadUrl: "/api/study-upload",
      contentType: file.type || undefined,
      multipart: true,
    });
    blobs.push({ url: blob.url, name: file.name, type: file.type });
  }
  if (blobs.length) form.set("studyBlobs", JSON.stringify(blobs));
}

export async function readStudyFile(form: FormData): Promise<{
  file: File | null;
  temporaryBlobUrl: string | null;
}> {
  const direct = form.get("file");
  if (direct instanceof File) return { file: direct, temporaryBlobUrl: null };

  const blobUrl = form.get("blobUrl");
  if (!isTrustedStudyBlobUrl(blobUrl)) return { file: null, temporaryBlobUrl: null };
  const response = await fetch(blobUrl);
  if (!response.ok) throw new Error("Uploaded study file could not be downloaded.");
  const body = await response.blob();
  const name = String(form.get("fileName") || "study-file");
  const type = String(form.get("fileType") || body.type);
  return { file: new File([body], name, { type }), temporaryBlobUrl: blobUrl };
}

export async function readStudyFiles(form: FormData): Promise<{
  files: File[];
  temporaryBlobUrls: string[];
}> {
  const direct = form.getAll("files").filter((value): value is File => value instanceof File);
  if (!direct.length) {
    const legacy = form.get("file");
    if (legacy instanceof File) direct.push(legacy);
  }

  const rawBlobs = form.get("studyBlobs");
  let blobs: StudyBlob[] = [];
  if (typeof rawBlobs === "string") {
    try {
      const parsed: unknown = JSON.parse(rawBlobs);
      if (Array.isArray(parsed) && parsed.every(isStudyBlob)) blobs = parsed;
    } catch {
      // Invalid descriptors are ignored here and leave normal source validation to the route.
    }
  }
  const downloaded = await Promise.all(
    blobs.map(async (blob) => {
      const response = await fetch(blob.url);
      if (!response.ok) throw new Error("Uploaded study file could not be downloaded.");
      return new File([await response.blob()], blob.name, { type: blob.type });
    }),
  );

  return { files: [...direct, ...downloaded], temporaryBlobUrls: blobs.map((blob) => blob.url) };
}
