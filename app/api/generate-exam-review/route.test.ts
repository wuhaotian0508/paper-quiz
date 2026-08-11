// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const model = vi.hoisted(() => ({
  collectResponse: vi.fn(),
  createResponse: vi.fn(),
}));

vi.mock("openai", () => ({
  default: class OpenAI {
    responses = { create: model.createResponse };
  },
}));

vi.mock("@/lib/openai-stream", () => ({
  collectResponse: model.collectResponse,
}));

import { POST } from "./route";

const originalKey = process.env.OPENAI_API_KEY;

function requestWith(form: FormData): Request {
  return new Request("http://localhost/api/generate-exam-review", { method: "POST", body: form });
}

afterEach(() => {
  process.env.OPENAI_API_KEY = originalKey;
});

beforeEach(() => {
  model.collectResponse.mockReset();
  model.createResponse.mockReset();
});

describe("POST /api/generate-exam-review", () => {
  it("rejects a request without a saved source", async () => {
    process.env.OPENAI_API_KEY = "test-key";

    const response = await POST(requestWith(new FormData()));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "A saved PDF source or lecture transcript is required.",
    });
  });

  it("checks the OpenAI configuration after accepting a saved source", async () => {
    process.env.OPENAI_API_KEY = "";
    const form = new FormData();
    form.set("fileIds", JSON.stringify(["file-lecture123"]));

    const response = await POST(requestWith(form));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "The server has not been configured with an OpenAI API key.",
    });
  });

  it("accepts saved quiz question context when the original PDF source is unavailable", async () => {
    process.env.OPENAI_API_KEY = "";
    const form = new FormData();
    form.set("questionContext", "Page 1: Retrieval grounds answers in evidence.");

    const response = await POST(requestWith(form));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "The server has not been configured with an OpenAI API key.",
    });
  });

  it("accepts a reattached PDF so review generation can recover page citations", async () => {
    process.env.OPENAI_API_KEY = "";
    const form = new FormData();
    form.set("file", new File(["%PDF-1.4\n"], "lecture.pdf", { type: "application/pdf" }));

    const response = await POST(requestWith(form));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "The server has not been configured with an OpenAI API key.",
    });
  });

  it("rejects malformed learner mistake context before calling OpenAI", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    const form = new FormData();
    form.set("fileIds", JSON.stringify(["file-lecture123"]));
    form.set("mistakes", "not-json");

    const response = await POST(requestWith(form));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Review mistakes are invalid." });
  });

  it("enforces an explicit Chinese brief even when the interface locale is English", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    const englishReview = JSON.stringify({
      title: "Physics review",
      sections: ["keyConcepts", "importantDetails", "examples", "questions"].map((kind, index) => ({
        kind,
        heading: `Section ${index + 1}`,
        items: [{ label: "Term", body: "Review the source material." }],
        sourceNote: `Page ${index + 1}`,
      })),
    });
    const chineseReview = JSON.stringify({
      title: "物理复习提纲",
      sections: ["keyConcepts", "importantDetails", "examples", "questions"].map((kind, index) => ({
        kind,
        heading: `第${index + 1}部分`,
        items: [{ label: "重点", body: "结合资料复习这个核心概念和适用条件。" }],
        sourceNote: `第${index + 1}页`,
      })),
    });
    model.createResponse
      .mockResolvedValueOnce({
        output_text: JSON.stringify({
          outputLanguage: "simplified-chinese",
          languageName: "Chinese",
        }),
      })
      .mockResolvedValueOnce("first-review-stream")
      .mockResolvedValueOnce("corrected-review-stream");
    model.collectResponse
      .mockResolvedValueOnce({ text: englishReview, stoppedEarlyBecause: null, usage: null })
      .mockResolvedValueOnce({ text: chineseReview, stoppedEarlyBecause: null, usage: null });
    const form = new FormData();
    form.set("locale", "en");
    form.set("brief", "请用中文写这份复习页。");
    form.set("questionContext", "Page 1: Momentum is mass times velocity.");

    const response = await POST(requestWith(form));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ title: "物理复习提纲" });
    expect(model.createResponse).toHaveBeenCalledTimes(3);
    expect(model.createResponse.mock.calls[1]?.[0].instructions).toContain(
      "The output language for this request is Simplified Chinese.",
    );
    expect(model.createResponse.mock.calls[2]?.[0].instructions).toContain(
      "failed the required output-language check",
    );
  });

  it("does not save an English review after its Chinese correction also fails", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    const englishReview = JSON.stringify({
      title: "Physics review",
      sections: ["keyConcepts", "importantDetails", "examples", "questions"].map((kind, index) => ({
        kind,
        heading: `Section ${index + 1}`,
        items: [{ label: "Term", body: "Review the source material." }],
        sourceNote: `Page ${index + 1}`,
      })),
    });
    model.createResponse
      .mockResolvedValueOnce({
        output_text: JSON.stringify({
          outputLanguage: "simplified-chinese",
          languageName: "Chinese",
        }),
      })
      .mockResolvedValueOnce("first-review-stream")
      .mockResolvedValueOnce("corrected-review-stream");
    model.collectResponse
      .mockResolvedValueOnce({ text: englishReview, stoppedEarlyBecause: null, usage: null })
      .mockResolvedValueOnce({ text: englishReview, stoppedEarlyBecause: null, usage: null });
    const form = new FormData();
    form.set("brief", "请用中文写这份复习页。");
    form.set("questionContext", "Page 1: Momentum is mass times velocity.");

    const response = await POST(requestWith(form));

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      error: "AI did not return the review in the requested language. Please try again.",
    });
  });
});
