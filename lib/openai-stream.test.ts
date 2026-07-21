import { describe, expect, it } from "vitest";
import { collectResponseText } from "./openai-stream";

async function* events() {
  yield { type: "response.created" };
  yield { type: "response.output_text.delta", delta: "{\"title\":" };
  yield { type: "response.output_text.delta", delta: "\"小测\"}" };
  yield { type: "response.completed" };
}

describe("collectResponseText", () => {
  it("joins only output text delta events", async () => {
    await expect(collectResponseText(events())).resolves.toBe('{"title":"小测"}');
  });
});
