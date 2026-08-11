import { describe, expect, it } from "vitest";
import { LearnerFacingError, learnerFacingMessage } from "./learner-error";

const fallback = "Quiz generation failed. Please try again later.";

describe("learnerFacingMessage", () => {
  it("passes through advice the route already worked out", () => {
    const cutOff = new LearnerFacingError(
      "The quiz was cut off before it finished. Ask for fewer questions and try again.",
    );

    expect(learnerFacingMessage(cutOff, fallback)).toBe(
      "The quiz was cut off before it finished. Ask for fewer questions and try again.",
    );
  });

  it("hides an unexpected failure behind the route's generic sentence", () => {
    expect(learnerFacingMessage(new Error("connect ECONNREFUSED 10.0.0.4:443"), fallback)).toBe(
      fallback,
    );
    expect(learnerFacingMessage("socket hang up", fallback)).toBe(fallback);
    expect(learnerFacingMessage(undefined, fallback)).toBe(fallback);
  });

  it("falls back when a learner-facing error carries no message to show", () => {
    expect(learnerFacingMessage(new LearnerFacingError(""), fallback)).toBe(fallback);
  });
});
