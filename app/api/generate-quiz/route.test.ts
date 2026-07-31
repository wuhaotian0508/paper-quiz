// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import { POST } from "./route";

const originalKey = process.env.OPENAI_API_KEY;

function requestWith(form: FormData): Request {
  return new Request("http://localhost/api/generate-quiz", {
    method: "POST",
    body: form,
  });
}

function validForm(file = new File(["%PDF-1.4"], "lecture.pdf", { type: "application/pdf" })) {
  const form = new FormData();
  form.set("file", file);
  form.set("count", "5");
  form.set("questions", JSON.stringify([{ type: "multiple_choice", count: 5 }]));
  form.set("difficulty", "basic");
  return form;
}

afterEach(() => {
  process.env.OPENAI_API_KEY = originalKey;
});

describe("POST /api/generate-quiz", () => {
  it("rejects a missing PDF in English", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    const response = await POST(requestWith(new FormData()));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Please upload a PDF or provide a lecture transcript.",
    });
  });

  it("rejects a non-PDF upload in English", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    const response = await POST(
      requestWith(validForm(new File(["hello"], "notes.txt", { type: "text/plain" }))),
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Only PDF files are supported." });
  });

  it("rejects unsupported settings before calling the model", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    const form = validForm();
    form.delete("questions");
    form.set("count", "7");
    const response = await POST(requestWith(form));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Question count is invalid" });
  });

  it("accepts a mixed question configuration whose total is not a legacy preset", async () => {
    process.env.OPENAI_API_KEY = "";
    const form = validForm();
    form.set("count", "9");
    form.set(
      "questions",
      JSON.stringify([
        { type: "multiple_choice", count: 5 },
        { type: "fill_blank", count: 3 },
        { type: "short_answer", count: 1 },
      ]),
    );

    const response = await POST(requestWith(form));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "The server has not been configured with an OpenAI API key.",
    });
  });

  it("rejects malformed question configurations before calling the model", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    const form = validForm();
    form.set(
      "questions",
      JSON.stringify([{ type: "custom", count: 1, label: "Calculation", instructions: "" }]),
    );
    const response = await POST(requestWith(form));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Question configuration is invalid" });
  });

  it("reports missing server configuration in English", async () => {
    process.env.OPENAI_API_KEY = "";
    const response = await POST(requestWith(validForm()));
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "The server has not been configured with an OpenAI API key.",
    });
  });

  it("accepts a reviewed transcript as quiz source before checking server configuration", async () => {
    process.env.OPENAI_API_KEY = "";
    const form = new FormData();
    form.set("transcript", "A reviewed lecture transcript about retrieval-augmented generation.");
    form.set("count", "5");
    form.set("difficulty", "basic");

    const response = await POST(requestWith(form));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "The server has not been configured with an OpenAI API key.",
    });
  });

  it("accepts multiple PDFs as one combined quiz source before checking server configuration", async () => {
    process.env.OPENAI_API_KEY = "";
    const form = validForm();
    form.delete("file");
    form.append("files", new File(["%PDF-1.4"], "lecture-1.pdf", { type: "application/pdf" }));
    form.append("files", new File(["%PDF-1.4"], "homework-1.pdf", { type: "application/pdf" }));

    const response = await POST(requestWith(form));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "The server has not been configured with an OpenAI API key.",
    });
  });

  it("rejects a transcript combined with PDF files", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    const form = validForm();
    form.delete("file");
    form.append("files", new File(["%PDF-1.4"], "lecture-1.pdf", { type: "application/pdf" }));
    form.set("transcript", "A reviewed lecture transcript.");

    const response = await POST(requestWith(form));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Choose either PDFs or a lecture transcript, not both.",
    });
  });

  it("rejects an empty transcript when no PDF is provided", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    const form = new FormData();
    form.set("transcript", "   ");
    form.set("count", "5");
    form.set("difficulty", "basic");

    const response = await POST(requestWith(form));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Please upload a PDF or provide a lecture transcript.",
    });
  });
});
