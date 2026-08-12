// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import {
  buildSourceFileParts,
  parseSourceFileId,
  parseSourceFileIds,
  SOURCE_FILE_TTL_SECONDS,
  uploadSourceFile,
  uploadSourceFiles,
} from "@/lib/source-reference";

const pdf = (name = "lecture.pdf", size = 32) =>
  new File([new Uint8Array(size)], name, { type: "application/pdf" });

describe("parseSourceFileId", () => {
  it("accepts provider file ids", () => {
    expect(parseSourceFileId("file-abc123XYZ")).toBe("file-abc123XYZ");
    expect(parseSourceFileId("  file-abc123XYZ  ")).toBe("file-abc123XYZ");
  });

  it("rejects anything that is not a file id", () => {
    for (const value of ["", "abc123", "file-", "sk-live-secret", 42, null, undefined]) {
      expect(parseSourceFileId(value)).toBeNull();
    }
  });

  it("rejects ids long enough to be a smuggled payload", () => {
    expect(parseSourceFileId(`file-${"a".repeat(200)}`)).toBeNull();
  });
});

describe("parseSourceFileIds", () => {
  it("accepts a bounded list of provider file ids", () => {
    expect(parseSourceFileIds('["file-lecture1", "file-lecture2"]')).toEqual([
      "file-lecture1",
      "file-lecture2",
    ]);
  });

  it("rejects a malformed or empty list", () => {
    expect(parseSourceFileIds("not json")).toBeNull();
    expect(parseSourceFileIds("[]")).toBeNull();
    expect(parseSourceFileIds('["file-lecture1", "not-a-file-id"]')).toBeNull();
  });
});

describe("uploadSourceFile", () => {
  it("uploads once with an expiry policy and returns the id", async () => {
    const create = vi.fn().mockResolvedValue({ id: "file-abc123" });
    const id = await uploadSourceFile({ files: { create } }, pdf());

    expect(id).toBe("file-abc123");
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0]).toMatchObject({
      purpose: "user_data",
      expires_after: { anchor: "created_at", seconds: SOURCE_FILE_TTL_SECONDS },
    });
  });

  it("returns null when the provider has no Files endpoint", async () => {
    const create = vi.fn().mockRejectedValue(new Error("404 not found"));
    expect(await uploadSourceFile({ files: { create } }, pdf())).toBeNull();
  });

  it("returns null when the provider returns an unusable id", async () => {
    const create = vi.fn().mockResolvedValue({ id: "not-a-file-id" });
    expect(await uploadSourceFile({ files: { create } }, pdf())).toBeNull();
  });
});

describe("uploadSourceFiles", () => {
  it("uploads every selected PDF and preserves its matching source id", async () => {
    const create = vi
      .fn()
      .mockResolvedValueOnce({ id: "file-lecture1" })
      .mockResolvedValueOnce({ id: "file-lecture2" });

    await expect(
      uploadSourceFiles({ files: { create } }, [pdf("lecture1.pdf"), pdf("lecture2.pdf")]),
    ).resolves.toEqual(["file-lecture1", "file-lecture2"]);
    expect(create).toHaveBeenCalledTimes(2);
    expect(create.mock.calls.map(([input]) => input.file.name)).toEqual([
      "lecture1.pdf",
      "lecture2.pdf",
    ]);
  });
});

describe("buildSourceFileParts", () => {
  it("references every selected PDF by its stored provider id", async () => {
    await expect(
      buildSourceFileParts({
        fileIds: ["file-lecture1", "file-lecture2"],
        files: [pdf("lecture1.pdf"), pdf("lecture2.pdf")],
      }),
    ).resolves.toEqual([
      { type: "input_file", file_id: "file-lecture1" },
      { type: "input_file", file_id: "file-lecture2" },
    ]);
  });

  it("references a stored file by id without re-sending bytes", async () => {
    expect(await buildSourceFileParts({ fileId: "file-abc123", file: pdf() })).toEqual([
      { type: "input_file", file_id: "file-abc123" },
    ]);
  });

  it("inlines the file when no id was issued", async () => {
    const parts = await buildSourceFileParts({ fileId: null, file: pdf() });
    expect(parts).toHaveLength(1);
    expect(parts[0]).toMatchObject({ type: "input_file", filename: "lecture.pdf" });
    expect("file_data" in parts[0] && parts[0].file_data).toContain("data:application/pdf;base64,");
  });

  it("returns no file parts for a transcript-only source", async () => {
    expect(await buildSourceFileParts({ fileId: null, file: null })).toEqual([]);
  });

  // Every route normalises a missing `fileIds` form field to `[]` and passes it alongside
  // the single `fileId`. Read as "a list was supplied", that empty array dropped the only
  // source a one-PDF session has, and grading and tutor chat ran with no material at all.
  it("falls back to the single id when the list beside it is empty", async () => {
    expect(await buildSourceFileParts({ fileId: "file-abc123", fileIds: [], files: [] })).toEqual([
      { type: "input_file", file_id: "file-abc123" },
    ]);
  });

  it("still inlines the single file when the list beside it is empty", async () => {
    const parts = await buildSourceFileParts({ fileId: null, fileIds: [], file: pdf() });
    expect(parts).toHaveLength(1);
    expect(parts[0]).toMatchObject({ filename: "lecture.pdf" });
  });

  it("does not impose the former 20 MB limit when a provider id is unavailable", async () => {
    const oversized = pdf("huge.pdf", 1);
    Object.defineProperty(oversized, "size", { value: 21 * 1024 * 1024 });
    const parts = await buildSourceFileParts({ fileId: null, file: oversized });
    expect(parts).toHaveLength(1);
    expect(parts[0]).toMatchObject({ type: "input_file", filename: "huge.pdf" });
  });
});
