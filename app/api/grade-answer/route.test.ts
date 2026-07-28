// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import { POST } from "./route";

const originalKey = process.env.OPENAI_API_KEY;
afterEach(() => {
  process.env.OPENAI_API_KEY = originalKey;
});

const writtenQuestion = JSON.stringify({
  id: "q1",
  type: "short_answer",
  prompt: "Explain RAG",
  explanation: "Retrieval grounds the model in real documents.",
  sourceNote: "Lecture 3",
  referenceAnswer: "Retrieval-augmented generation",
  gradingCriteria: ["mentions retrieval"],
  customLabel: null,
});

describe("POST /api/grade-answer", () => {
  it("rejects incomplete grading context", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    const response = await POST(
      new Request("http://localhost/api/grade-answer", { method: "POST", body: new FormData() }),
    );
    expect(response.status).toBe(400);
  });

  it("reports missing server configuration before grading", async () => {
    process.env.OPENAI_API_KEY = "";
    const form = new FormData();
    form.set(
      "question",
      JSON.stringify({
        id: "q1",
        type: "fill_blank",
        prompt: "RAG",
        acceptedAnswers: ["retrieval augmented generation"],
        referenceAnswer: "Retrieval-augmented generation",
        explanation: "It is an acronym.",
        sourceNote: "Lecture",
      }),
    );
    form.set("answer", "retrieval generation");
    form.set("transcript", "Lecture content");
    const response = await POST(
      new Request("http://localhost/api/grade-answer", { method: "POST", body: form }),
    );
    expect(response.status).toBe(503);
  });

  it("rejects a study material reference that is not a provider file id", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    const form = new FormData();
    form.set("question", writtenQuestion);
    form.set("answer", "It retrieves documents first.");
    form.set("fileId", "../../etc/passwd");
    const response = await POST(
      new Request("http://localhost/api/grade-answer", { method: "POST", body: form }),
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "The study material reference is invalid." });
  });

  it("accepts a stored file id as the only study material", async () => {
    process.env.OPENAI_API_KEY = "";
    const form = new FormData();
    form.set("question", writtenQuestion);
    form.set("answer", "It retrieves documents first.");
    form.set("fileId", "file-abc123");
    const response = await POST(
      new Request("http://localhost/api/grade-answer", { method: "POST", body: form }),
    );
    // Reaching the config check proves the file id satisfied the study-material requirement.
    expect(response.status).toBe(503);
  });
});
