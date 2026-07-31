/**
 * Reasoning tokens are billed against `max_output_tokens` too, so a fixed budget that
 * looked fine for 5 multiple-choice questions silently truncated 15 mixed ones — and
 * truncated JSON surfaces as an unhelpful "incomplete quiz format" error.
 *
 * This is a cap, not a reservation: unused budget costs nothing, so it is set generously.
 * Written and custom questions carry a reference answer plus grading criteria, which is
 * why the per-question allowance is well above what a multiple-choice item needs.
 */
export const REASONING_TOKEN_ALLOWANCE = 2_000;
export const TOKENS_PER_QUESTION = 500;

export function getQuizGenerationOptions(model: string, questionCount = 5) {
  return {
    model,
    stream: true as const,
    max_output_tokens: REASONING_TOKEN_ALLOWANCE + Math.max(1, questionCount) * TOKENS_PER_QUESTION,
    reasoning: { effort: "low" as const },
  };
}
