import { describe, expect, it } from "vitest";
import {
  getQuizGenerationOptions,
  REASONING_TOKEN_ALLOWANCE,
  TOKENS_PER_QUESTION,
} from "./quiz-generation";

describe("getQuizGenerationOptions", () => {
  it("uses a low-latency generation profile", () => {
    expect(getQuizGenerationOptions("gpt-5.5", 5)).toEqual({
      model: "gpt-5.5",
      stream: true,
      max_output_tokens: REASONING_TOKEN_ALLOWANCE + 5 * TOKENS_PER_QUESTION,
      reasoning: { effort: "low" },
    });
  });

  it("grows the output budget with the question count", () => {
    // A fixed budget truncated large quizzes, because reasoning tokens share it.
    const five = getQuizGenerationOptions("gpt-5.5", 5).max_output_tokens;
    const fifteen = getQuizGenerationOptions("gpt-5.5", 15).max_output_tokens;
    expect(fifteen).toBeGreaterThan(five);
    expect(fifteen).toBe(REASONING_TOKEN_ALLOWANCE + 15 * TOKENS_PER_QUESTION);
  });

  it("still leaves room for reasoning when no count is given", () => {
    expect(getQuizGenerationOptions("gpt-5.5").max_output_tokens).toBeGreaterThan(
      REASONING_TOKEN_ALLOWANCE,
    );
  });
});
