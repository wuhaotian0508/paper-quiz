/**
 * An error whose message was written for the learner and is safe to return verbatim.
 *
 * Routes collapse unexpected failures into one generic sentence so internals never reach a
 * response body. That also swallowed the advice the route had already worked out — "the quiz
 * was cut off, ask for fewer questions" arrived as "Quiz generation failed. Please try again
 * later.", which tells the learner nothing they can act on. Marking those messages keeps the
 * generic default for everything else.
 */
export class LearnerFacingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LearnerFacingError";
  }
}

/** The learner-facing message when there is one, and the route's generic sentence otherwise. */
export function learnerFacingMessage(error: unknown, fallback: string): string {
  return error instanceof LearnerFacingError && error.message ? error.message : fallback;
}
