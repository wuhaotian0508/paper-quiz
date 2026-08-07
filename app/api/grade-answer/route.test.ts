// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

const { create } = vi.hoisted(() => ({ create: vi.fn() }));

vi.mock("openai", () => ({
  default: class {
    responses = { create };
  },
}));

import { POST } from "./route";

const originalKey = process.env.OPENAI_API_KEY;
afterEach(() => {
  process.env.OPENAI_API_KEY = originalKey;
  create.mockReset();
});

async function* textResponse(text: string) {
  yield { type: "response.output_text.delta", delta: text };
}

/** The text part of the single user message the route builds. */
function promptText() {
  return create.mock.calls[0][0].input[0].content[0].text as string;
}

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

  describe("learner memory", () => {
    const grade = JSON.stringify({
      status: "partial",
      score: 0.5,
      feedback: "Name the retrieval step.",
      missingPoints: ["retrieval"],
    });

    function gradingForm(memory?: string) {
      const form = new FormData();
      form.set("question", writtenQuestion);
      form.set("answer", "It generates from documents.");
      form.set("transcript", "Retrieval-augmented generation retrieves before generating.");
      if (memory !== undefined) form.set("memory", memory);
      return new Request("http://localhost/api/grade-answer", { method: "POST", body: form });
    }

    it("passes a supplied memory block through with its verdict guard", async () => {
      process.env.OPENAI_API_KEY = "test-key";
      create.mockResolvedValue(textResponse(grade));

      const response = await POST(
        gradingForm(
          "LEARNER MEMORY:\n- [reported difficulty] I always mix up retrieval and ranking",
        ),
      );

      expect(response.status).toBe(200);
      expect(promptText()).toContain("I always mix up retrieval and ranking");
      expect(promptText()).toContain("must not change the status or the score");
    });

    it("grades normally when no memory is supplied", async () => {
      process.env.OPENAI_API_KEY = "test-key";
      create.mockResolvedValue(textResponse(grade));

      const response = await POST(gradingForm());

      expect(response.status).toBe(200);
      expect(promptText()).not.toContain("LEARNER MEMORY");
    });

    it("drops an oversized memory block instead of failing the grade", async () => {
      process.env.OPENAI_API_KEY = "test-key";
      create.mockResolvedValue(textResponse(grade));

      // A corrupted or tampered book must not cost the student their grading.
      const response = await POST(gradingForm("x".repeat(5_000)));

      expect(response.status).toBe(200);
      expect(promptText()).not.toContain("xxxx");
    });
  });
});
