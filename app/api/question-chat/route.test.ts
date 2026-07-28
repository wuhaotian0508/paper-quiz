// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import { POST } from "./route";

const originalKey = process.env.OPENAI_API_KEY;
afterEach(() => {
  process.env.OPENAI_API_KEY = originalKey;
});

const question = JSON.stringify({
  id: "q1",
  type: "short_answer",
  prompt: "Explain RAG",
  explanation: "Retrieval grounds the model in real documents.",
  sourceNote: "Lecture 3",
  referenceAnswer: "Retrieval-augmented generation",
  gradingCriteria: ["mentions retrieval"],
  customLabel: null,
});

function chatForm(entries: Record<string, string>) {
  const form = new FormData();
  form.set("question", question);
  form.set("message", "Why is retrieval needed?");
  for (const [key, value] of Object.entries(entries)) form.set(key, value);
  return new Request("http://localhost/api/question-chat", { method: "POST", body: form });
}

describe("POST /api/question-chat", () => {
  it("requires a question, message, and source material", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    const response = await POST(
      new Request("http://localhost/api/question-chat", { method: "POST", body: new FormData() }),
    );
    expect(response.status).toBe(400);
  });

  it("rejects a study material reference that is not a provider file id", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    const response = await POST(chatForm({ fileId: "sk-leaked-secret" }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "The study material reference is invalid." });
  });

  it("accepts a stored file id as the only study material", async () => {
    process.env.OPENAI_API_KEY = "";
    const response = await POST(chatForm({ fileId: "file-abc123" }));
    // Reaching the config check proves the file id satisfied the study-material requirement.
    expect(response.status).toBe(503);
  });

  it("rejects an oversized transcript instead of silently dropping it", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    const response = await POST(chatForm({ transcript: "a".repeat(120_001) }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Lecture transcript is too long or invalid." });
  });
});
