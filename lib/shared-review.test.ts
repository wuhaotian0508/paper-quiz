import { describe, expect, it } from "vitest";
import { buildSharedReview, getSharedReviewUrl } from "./shared-review";

describe("shared review artifacts", () => {
  it("keeps generated review content but strips private mistake identifiers", () => {
    const shared = buildSharedReview({
      title: "Lecture Review",
      topics: [
        {
          topic: "Retrieval",
          keyIdeas: ["Retrieve context first."],
          formulaOrProcedure: "Retrieve, rank, generate.",
          commonConfusion: "Retrieval is not training.",
          sourceNote: "Page 1",
          relatedMistakeIds: ["private-mistake-id"],
          mistakeFocus: "Review the sequence.",
        },
      ],
    });

    expect(shared).toEqual({
      title: "Lecture Review",
      topics: [
        {
          topic: "Retrieval",
          keyIdeas: ["Retrieve context first."],
          formulaOrProcedure: "Retrieve, rank, generate.",
          commonConfusion: "Retrieval is not training.",
          sourceNote: "Page 1",
          mistakeFocus: "Review the sequence.",
        },
      ],
    });
    expect(JSON.stringify(shared)).not.toContain("private-mistake-id");
  });

  it("builds a review-specific URL", () => {
    expect(getSharedReviewUrl("https://paperquiz.test", "review-123")).toBe(
      "https://paperquiz.test/review/review-123",
    );
  });
});
