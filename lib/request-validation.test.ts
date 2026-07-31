import { describe, expect, it } from "vitest";
import { parseChatHistory, readBoundedText, validatePdfFile } from "./request-validation";

describe("request validation", () => {
  it("rejects malformed or oversized chat history", () => {
    expect(parseChatHistory("not-json")).toEqual({ ok: false, error: "Chat history is invalid." });
    expect(parseChatHistory(JSON.stringify([{ role: "user", content: "x".repeat(2001) }]))).toEqual(
      { ok: false, error: "Chat history is invalid." },
    );
  });

  it("accepts only bounded chat messages", () => {
    expect(parseChatHistory(JSON.stringify([{ role: "user", content: "Explain this" }]))).toEqual({
      ok: true,
      value: [{ role: "user", content: "Explain this" }],
    });
  });

  it("validates PDF type without imposing an application size limit", () => {
    expect(
      validatePdfFile(new File(["pdf"], "lecture.pdf", { type: "application/pdf" })).valid,
    ).toBe(true);
    expect(
      validatePdfFile(
        new File([new Uint8Array(20 * 1024 * 1024 + 1)], "large.pdf", {
          type: "application/pdf",
        }),
      ).valid,
    ).toBe(true);
    expect(validatePdfFile(new File(["text"], "lecture.txt", { type: "text/plain" })).valid).toBe(
      false,
    );
  });

  it("bounds form text", () => {
    expect(readBoundedText("  hello ", 10)).toBe("hello");
    expect(readBoundedText("x".repeat(11), 10)).toBeNull();
  });
});
