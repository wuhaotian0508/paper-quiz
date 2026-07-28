// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import {
  buildSourceFileParts,
  parseSourceFileId,
  SOURCE_FILE_TTL_SECONDS,
  uploadSourceFile,
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

describe("buildSourceFileParts", () => {
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

  it("never emits a part with a null payload when the file is oversized", async () => {
    const oversized = pdf("huge.pdf", 1);
    Object.defineProperty(oversized, "size", { value: 21 * 1024 * 1024 });
    expect(await buildSourceFileParts({ fileId: null, file: oversized })).toEqual([]);
  });
});
