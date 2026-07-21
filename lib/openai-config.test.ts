import { describe, expect, it } from "vitest";
import { getOpenAIClientOptions } from "./openai-config";

describe("getOpenAIClientOptions", () => {
  it("passes a configured base URL to the OpenAI client", () => {
    expect(
      getOpenAIClientOptions({
        OPENAI_API_KEY: "test-key",
        OPENAI_BASE_URL: "https://gateway.example/v1",
      }),
    ).toEqual({
      apiKey: "test-key",
      baseURL: "https://gateway.example/v1",
    });
  });

  it("omits base URL when the default endpoint should be used", () => {
    expect(getOpenAIClientOptions({ OPENAI_API_KEY: "test-key" })).toEqual({
      apiKey: "test-key",
    });
  });
});
