// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import { POST } from "./route";

const originalKey = process.env.OPENAI_API_KEY;
afterEach(() => { process.env.OPENAI_API_KEY = originalKey; });

describe("POST /api/grade-answer", () => {
  it("rejects incomplete grading context", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    const response = await POST(new Request("http://localhost/api/grade-answer", { method: "POST", body: new FormData() }));
    expect(response.status).toBe(400);
  });

  it("reports missing server configuration before grading", async () => {
    process.env.OPENAI_API_KEY = "";
    const form = new FormData();
    form.set("question", JSON.stringify({ id: "q1", type: "fill_blank", prompt: "RAG", acceptedAnswers: ["retrieval augmented generation"], referenceAnswer: "Retrieval-augmented generation", explanation: "It is an acronym.", sourceNote: "Lecture" }));
    form.set("answer", "retrieval generation");
    form.set("transcript", "Lecture content");
    const response = await POST(new Request("http://localhost/api/grade-answer", { method: "POST", body: form }));
    expect(response.status).toBe(503);
  });
});
