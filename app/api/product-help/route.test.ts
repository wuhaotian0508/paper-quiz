// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";

const { create } = vi.hoisted(() => ({ create: vi.fn() }));

vi.mock("openai", () => ({
  default: class {
    responses = { create };
  },
}));

import { POST } from "./route";

const originalKey = process.env.OPENAI_API_KEY;

function request(body: unknown) {
  return new Request("http://localhost/api/product-help", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

afterEach(() => {
  process.env.OPENAI_API_KEY = originalKey;
  create.mockReset();
});

it("returns API guidance for a valid product question", async () => {
  process.env.OPENAI_API_KEY = "test-key";
  create.mockResolvedValue({
    output_text: JSON.stringify({ reply: "1. Click History.", needsFeedback: false }),
  });

  const response = await POST(request({ message: "Where is my past work?" }));

  expect(await response.json()).toEqual({ reply: "1. Click History.", needsFeedback: false });
  expect(create).toHaveBeenCalledWith(expect.objectContaining({ model: expect.any(String) }));
});

it("rejects study material fields without calling OpenAI", async () => {
  process.env.OPENAI_API_KEY = "test-key";

  const response = await POST(request({ message: "Help", transcript: "private lecture text" }));

  expect(response.status).toBe(400);
  expect(create).not.toHaveBeenCalled();
});

it("rejects malformed JSON without calling OpenAI", async () => {
  process.env.OPENAI_API_KEY = "test-key";
  const response = await POST(
    new Request("http://localhost/api/product-help", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "not-json",
    }),
  );

  expect(response.status).toBe(400);
  expect(create).not.toHaveBeenCalled();
});

it("returns the configuration error before creating a client", async () => {
  process.env.OPENAI_API_KEY = "";

  const response = await POST(request({ message: "Help" }));

  expect(response.status).toBe(503);
});
