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
    });
  });

  it("surfaces the token limit so truncation is not mistaken for bad formatting", async () => {
    await expect(collectResponse(truncated())).resolves.toEqual({
      text: '{"title":"Half a qu',
      stoppedEarlyBecause: "max_output_tokens",
    });
  });

  it("surfaces a failed response", async () => {
    expect((await collectResponse(failed())).stoppedEarlyBecause).toBe("failed");
  });
});
