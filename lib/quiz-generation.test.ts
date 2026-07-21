import { describe, expect, it } from "vitest";
import { getQuizGenerationOptions } from "./quiz-generation";

describe("getQuizGenerationOptions", () => {
  it("uses a bounded low-latency generation profile", () => {
    expect(getQuizGenerationOptions("gpt-5.5")).toEqual({
      model: "gpt-5.5",
      stream: true,
      max_output_tokens: 3200,
      reasoning: { effort: "low" },
    });
  });
});
