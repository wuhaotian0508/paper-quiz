import { describe, expect, it } from "vitest";
import { collectResponse, collectResponseText } from "./openai-stream";

async function* events() {
  yield { type: "response.created" };
  yield { type: "response.output_text.delta", delta: '{"title":' };
  yield { type: "response.output_text.delta", delta: '"小测"}' };
  yield { type: "response.completed" };
}

async function* truncated() {
  yield { type: "response.output_text.delta", delta: '{"title":"Half a qu' };
  yield {
    type: "response.incomplete",
    response: { status: "incomplete", incomplete_details: { reason: "max_output_tokens" } },
  };
}

async function* failed() {
  yield { type: "response.output_text.delta", delta: "partial" };
  yield { type: "response.failed", response: { status: "failed" } };
}

describe("collectResponseText", () => {
  it("joins only output text delta events", async () => {
    await expect(collectResponseText(events())).resolves.toBe('{"title":"小测"}');
  });
});

describe("collectResponse", () => {
  it("reports a completed response as not stopped early", async () => {
    await expect(collectResponse(events())).resolves.toEqual({
      text: '{"title":"小测"}',
      stoppedEarlyBecause: null,
      usage: null,
    });
  });

  it("surfaces the token limit so truncation is not mistaken for bad formatting", async () => {
    await expect(collectResponse(truncated())).resolves.toEqual({
      text: '{"title":"Half a qu',
      stoppedEarlyBecause: "max_output_tokens",
      usage: null,
    });
  });

  it("surfaces a failed response", async () => {
    expect((await collectResponse(failed())).stoppedEarlyBecause).toBe("failed");
  });
});

describe("token usage", () => {
  it("reports what the call consumed", async () => {
    async function* events() {
      yield { type: "response.output_text.delta", delta: "hi" };
      yield {
        type: "response.completed",
        response: { usage: { input_tokens: 1200, output_tokens: 340 } },
      };
    }
    expect((await collectResponse(events())).usage).toEqual({
      inputTokens: 1200,
      outputTokens: 340,
    });
  });

  it("still reports usage for a response that was cut off", async () => {
    // A truncated response was billed too, so it has to reach the meter.
    async function* events() {
      yield { type: "response.output_text.delta", delta: "par" };
      yield {
        type: "response.incomplete",
        response: {
          incomplete_details: { reason: "max_output_tokens" },
          usage: { input_tokens: 900, output_tokens: 4500 },
        },
      };
    }
    const result = await collectResponse(events());
    expect(result.stoppedEarlyBecause).toBe("max_output_tokens");
    expect(result.usage).toEqual({ inputTokens: 900, outputTokens: 4500 });
  });

  it("returns null when the gateway reports no usage", async () => {
    async function* events() {
      yield { type: "response.output_text.delta", delta: "hi" };
      yield { type: "response.completed", response: {} };
    }
    expect((await collectResponse(events())).usage).toBeNull();
  });
});
