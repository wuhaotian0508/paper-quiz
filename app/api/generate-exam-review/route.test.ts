// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import { POST } from "./route";

const originalKey = process.env.OPENAI_API_KEY;

function requestWith(form: FormData): Request {
  return new Request("http://localhost/api/generate-exam-review", { method: "POST", body: form });
}

afterEach(() => {
  process.env.OPENAI_API_KEY = originalKey;
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
});
