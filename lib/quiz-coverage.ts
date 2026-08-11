import { questionKey, type Question, type Quiz } from "@/lib/quiz";

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

const topicOf = (question: Question) => (question.topic || "").trim().toLowerCase();

/**
 * How many questions sit on the most-covered topic, or 0 when any question went unlabelled.
 *
 * An unlabelled set is every quiz saved before topics existed, plus any gateway that drops
 * the field. Returning 0 leaves those alone rather than judging a spread that was never
 * reported.
 */
export function largestTopicShare(quiz: Quiz): number {
  const counts = new Map<string, number>();
  for (const question of quiz.questions) {
    const topic = topicOf(question);
    if (!topic) return 0;
    counts.set(topic, (counts.get(topic) ?? 0) + 1);
  }
  return counts.size ? Math.max(...counts.values()) : 0;
}

/** Below this there is no distribution to speak of, so the check stays out of the way. */
const MIN_QUESTIONS_FOR_COVERAGE = 4;

/**
 * "Questions cluster on a few topics instead of covering the whole source" was the most
 * damaging quality complaint this product received, and asking the prompt to spread the set
 * was never enough on its own — nothing measured the result.
 *
 * One topic may hold up to half the questions: a source really can be narrow, and a set that
 * leans is not a broken set. Past half it has stopped reviewing the material and started
 * drilling one corner of it.
 */
export function quizClustersOnOneTopic(quiz: Quiz): boolean {
  const total = quiz.questions.length;
  if (total < MIN_QUESTIONS_FOR_COVERAGE) return false;
  return largestTopicShare(quiz) > Math.ceil(total / 2);
}

const REPEATED_QUESTION_CORRECTION =
  "The previous quiz contained a repeated question. Replace it with a distinct question that tests a different source-supported concept.";

const CLUSTERED_TOPIC_CORRECTION =
  "The previous quiz put more than half of its questions on a single topic. Regenerate the whole set so the questions are spread across the distinct major topics in the study material, and label each question with the topic it assesses.";

const isRepeatedQuestion = (error: unknown) =>
  error instanceof Error && error.message.toLowerCase().includes("repeated question");

/**
 * Runs generation, and spends at most one extra attempt correcting what the first one got
 * wrong. Only the recoverable cases are retried; malformed model output is never hidden.
 */
export async function generateDistinctQuiz(
  generate: (correction?: string) => Promise<Quiz>,
): Promise<Quiz> {
  let correction: string;
  try {
    const first = await generate();
    assertDistinctQuizQuestions(first);
    if (!quizClustersOnOneTopic(first)) return first;
    correction = CLUSTERED_TOPIC_CORRECTION;
  } catch (error) {
    if (!isRepeatedQuestion(error)) throw error;
    correction = REPEATED_QUESTION_CORRECTION;
  }

  const corrected = await generate(correction);
  assertDistinctQuizQuestions(corrected);
  // Coverage deliberately is not re-checked. A source narrow enough to cluster twice is far
  // more likely to be a short source than a bad generation, and losing the learner's quiz to
  // a distribution heuristic would cost them more than the clustering does.
  return corrected;
}
