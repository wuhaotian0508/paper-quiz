// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import { POST } from "./route";

const originalKey = process.env.OPENAI_API_KEY;
afterEach(() => { process.env.OPENAI_API_KEY = originalKey; });

describe("POST /api/question-chat", () => {
  it("requires a question, message, and source material", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    const response = await POST(new Request("http://localhost/api/question-chat", { method: "POST", body: new FormData() }));
    expect(response.status).toBe(400);
  });
});
