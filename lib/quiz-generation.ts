export function getQuizGenerationOptions(model: string) {
  return {
    model,
    stream: true as const,
    max_output_tokens: 3200,
    reasoning: { effort: "low" as const },
  };
}
