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

function promptText() {
  return create.mock.calls[0][0].input[0].content[0].text as string;
}

const choiceQuestion = JSON.stringify({
  id: "q1",
  type: "multiple_choice",
  prompt: "What is the core test?",
  explanation: "Repeat use and willingness to pay.",
  sourceNote: "page 1",
  correctOptionId: "b",
  options: [
    { id: "a", text: "Campus demos replace all channels" },
    { id: "b", text: "Repeat use and willingness to pay" },
    { id: "c", text: "Licences are the only revenue" },
    { id: "d", text: "Feedback data is immediately available" },
  ],
});

const explanations = JSON.stringify({
  a: "Confuses one channel with the test itself.",
  b: "This is the stated core test.",
  c: "Mistakes one revenue option for the only one.",
  d: "Data availability is not what is validated.",
});

function request(build: (form: FormData) => void) {
  const form = new FormData();
  build(form);
  return new Request("http://localhost/api/explain-options", { method: "POST", body: form });
}

describe("POST /api/explain-options", () => {
  it("rejects a request with no question", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    const response = await POST(request(() => {}));
    expect(response.status).toBe(400);
  });

  it("rejects a question type that has no options", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    const response = await POST(
      request((form) =>
        form.set(
          "question",
          JSON.stringify({
            id: "q1",
            type: "short_answer",
            prompt: "Explain RAG",
            explanation: "...",
            sourceNote: "Lecture 3",
            referenceAnswer: "Retrieval-augmented generation",
            gradingCriteria: ["mentions retrieval"],
            customLabel: null,
          }),
        ),
      ),
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Only multiple-choice questions have per-option analysis.",
    });
  });

  it("rejects a study material reference that is not a provider file id", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    const response = await POST(
      request((form) => {
        form.set("question", choiceQuestion);
        form.set("fileId", "../../etc/passwd");
      }),
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "The study material reference is invalid." });
  });

  it("reports missing server configuration before explaining", async () => {
    process.env.OPENAI_API_KEY = "";
    const response = await POST(request((form) => form.set("question", choiceQuestion)));
    expect(response.status).toBe(503);
  });

  it("returns one explanation per option", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    create.mockResolvedValue(textResponse(explanations));

    const response = await POST(
      request((form) => {
        form.set("question", choiceQuestion);
        form.set("transcript", "The core test asks about repeat use and willingness to pay.");
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(JSON.parse(explanations));
  });

  it("grounds the explanation in the study material when there is some", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    create.mockResolvedValue(textResponse(explanations));

    await POST(
      request((form) => {
        form.set("question", choiceQuestion);
        form.set("transcript", "The core test asks about repeat use.");
      }),
    );

    expect(promptText()).toContain("only on the supplied study material");
    expect(promptText()).toContain("LECTURE TRANSCRIPT:");
  });

  it("still explains a mistake-book question whose study material is gone", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    create.mockResolvedValue(textResponse(explanations));

    // The case the backfill exists for: an entry saved before source tracking, or one whose
    // uploaded PDF has since expired. Refusing it would leave the analysis permanently blank.
    const response = await POST(request((form) => form.set("question", choiceQuestion)));

    expect(response.status).toBe(200);
    expect(promptText()).toContain("study material is unavailable");
    expect(promptText()).toContain("Do not invent source facts");
  });

  it("accepts a response the gateway wrapped in a Markdown code fence", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    create.mockResolvedValue(textResponse("```json\n" + explanations + "\n```"));

    const response = await POST(request((form) => form.set("question", choiceQuestion)));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(JSON.parse(explanations));
  });

  it("reports prose instead of storing it as an explanation", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    // What the gateway actually returned in production when only `text.format` asked for JSON.
    create.mockResolvedValue(textResponse("a. This is wrong because it confuses channels."));

    const response = await POST(request((form) => form.set("question", choiceQuestion)));
    expect(response.status).toBe(502);
  });

  it("reports a truncated response instead of returning partial analysis", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    create.mockResolvedValue(
      (async function* () {
        yield { type: "response.output_text.delta", delta: '{"a":"Partial' };
        yield {
          type: "response.incomplete",
          response: { incomplete_details: { reason: "max_output_tokens" } },
        };
      })(),
    );

    const response = await POST(request((form) => form.set("question", choiceQuestion)));
    expect(response.status).toBe(502);
  });
});
