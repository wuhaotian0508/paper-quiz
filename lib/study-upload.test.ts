import { describe, expect, it } from "vitest";
import { attachStudyFile, attachStudyFiles, isTrustedStudyBlobUrl } from "./study-upload";

describe("study upload", () => {
  it("accepts only Vercel Blob HTTPS URLs", () => {
    expect(
      isTrustedStudyBlobUrl("https://store-id.public.blob.vercel-storage.com/study/lecture.pdf"),
    ).toBe(true);
    expect(isTrustedStudyBlobUrl("https://example.com/lecture.pdf")).toBe(false);
    expect(isTrustedStudyBlobUrl("http://store-id.public.blob.vercel-storage.com/file.pdf")).toBe(
      false,
    );
  });

  it("uses a direct Blob upload instead of a function body for large files", async () => {
    const form = new FormData();
    const file = new File([new Uint8Array(4 * 1024 * 1024 + 1)], "lecture.pdf", {
      type: "application/pdf",
    });
    const calls: unknown[] = [];
    const uploader = async (...args: unknown[]) => {
      calls.push(args);
      return {
        url: "https://store.public.blob.vercel-storage.com/study/lecture.pdf",
        downloadUrl: "https://store.public.blob.vercel-storage.com/study/lecture.pdf?download=1",
        pathname: "study/lecture.pdf",
        contentType: "application/pdf",
        contentDisposition: "inline",
      };
    };

    await attachStudyFile(form, file, uploader as Parameters<typeof attachStudyFile>[2]);

    expect(calls).toHaveLength(1);
    expect(form.get("file")).toBeNull();
    expect(form.get("blobUrl")).toBe(
      "https://store.public.blob.vercel-storage.com/study/lecture.pdf",
    );
  });

  it("keeps every PDF when a combined quiz includes direct and Blob uploads", async () => {
    const form = new FormData();
    const direct = new File(["one"], "lecture-1.pdf", { type: "application/pdf" });
    const large = new File([new Uint8Array(4 * 1024 * 1024 + 1)], "lecture-2.pdf", {
      type: "application/pdf",
    });
    const uploader = async () => ({
      url: "https://store.public.blob.vercel-storage.com/study/lecture-2.pdf",
      downloadUrl: "https://store.public.blob.vercel-storage.com/study/lecture-2.pdf?download=1",
      pathname: "study/lecture-2.pdf",
      contentType: "application/pdf",
      contentDisposition: "inline" as const,
    });

    await attachStudyFiles(
      form,
      [direct, large],
      uploader as unknown as Parameters<typeof attachStudyFile>[2],
    );

    expect(form.getAll("files")).toEqual([direct]);
    expect(form.get("studyBlobs")).toBe(
      JSON.stringify([
        {
          url: "https://store.public.blob.vercel-storage.com/study/lecture-2.pdf",
          name: "lecture-2.pdf",
          type: "application/pdf",
        },
      ]),
    );
  });
});
