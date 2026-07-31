import { questionKey, type Quiz } from "@/lib/quiz";

/**
 * The model can repeat a question with only punctuation or capitalization changed. Reject it
 * before it reaches the learner so the route can request one corrected replacement set.
 */
export function assertDistinctQuizQuestions(quiz: Quiz) {
  const seen = new Set<string>();
  for (const question of quiz.questions) {
    const key = questionKey(question);
    if (seen.has(key)) throw new Error("Quiz contains a repeated question.");
    seen.add(key);
  }
}

/** Retries only the recoverable duplicate-output case, never hides malformed model output. */
export async function generateDistinctQuiz(
  generate: (correction?: string) => Promise<Quiz>,
): Promise<Quiz> {
  try {
    const first = await generate();
    assertDistinctQuizQuestions(first);
    return first;
  } catch (error) {
    if (!(error instanceof Error) || !error.message.toLowerCase().includes("repeated question"))
      throw error;
  }

  const corrected = await generate(
    "The previous quiz contained a repeated question. Replace it with a distinct question that tests a different source-supported concept.",
  );
  assertDistinctQuizQuestions(corrected);
  return corrected;
}
