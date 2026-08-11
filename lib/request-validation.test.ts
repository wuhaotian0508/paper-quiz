import { describe, expect, it } from "vitest";
import {
  MAX_GENERATION_BRIEF_CHARS,
  parseChatHistory,
  parseGenerationBrief,
  parseReviewMistakeContext,
  readBoundedText,
  safeStorageSet,
  STORAGE_WRITE_FAILED_EVENT,
  validatePdfFile,
} from "./request-validation";

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

  it("trims a generation brief and ignores anything that is not text", () => {
    expect(parseGenerationBrief("  Focus on chapter 3.  ")).toBe("Focus on chapter 3.");
    expect(parseGenerationBrief(null)).toBe("");
    expect(parseGenerationBrief(undefined)).toBe("");
    expect(parseGenerationBrief(42)).toBe("");
  });

  it("truncates an over-long brief instead of failing the generation", () => {
    expect(parseGenerationBrief("a".repeat(MAX_GENERATION_BRIEF_CHARS + 200))).toHaveLength(
      MAX_GENERATION_BRIEF_CHARS,
    );
  });

  it("accepts only compact mistake context for a review", () => {
    expect(
      parseReviewMistakeContext(
        JSON.stringify([
          {
            id: "mistake-1",
            prompt: "What is retrieval?",
            answer: "Training",
            referenceAnswer: "Finding source context",
            feedback: "Review the sequence.",
            status: "incorrect",
            sourceNote: "Page 2",
          },
        ]),
      ),
    ).toEqual({
      ok: true,
      value: [
        {
          id: "mistake-1",
          prompt: "What is retrieval?",
          answer: "Training",
          referenceAnswer: "Finding source context",
          feedback: "Review the sequence.",
          status: "incorrect",
          sourceNote: "Page 2",
        },
      ],
    });
    expect(parseReviewMistakeContext("not-json")).toEqual({
      ok: false,
      error: "Review mistakes are invalid.",
    });
  });
});

describe("safeStorageSet", () => {
  const fullStorage = {
    setItem: () => {
      throw new DOMException("QuotaExceededError");
    },
  } as unknown as Storage;

  it("announces a refused write, so a full quota cannot stop saving in silence", () => {
    const heard: string[] = [];
    const listen = (event: Event) => heard.push(String((event as CustomEvent).detail));
    window.addEventListener(STORAGE_WRITE_FAILED_EVENT, listen);

    const saved = safeStorageSet("paper-quiz-mistakes", "[]", fullStorage);

    window.removeEventListener(STORAGE_WRITE_FAILED_EVENT, listen);
    expect(saved).toBe(false);
    expect(heard).toEqual(["paper-quiz-mistakes"]);
  });

  it("stays quiet when the write succeeds", () => {
    const heard: string[] = [];
    const listen = () => heard.push("failed");
    window.addEventListener(STORAGE_WRITE_FAILED_EVENT, listen);

    const saved = safeStorageSet("paper-quiz-mistakes", "[]", window.localStorage);

    window.removeEventListener(STORAGE_WRITE_FAILED_EVENT, listen);
    expect(saved).toBe(true);
    expect(heard).toEqual([]);
  });
});
