import { describe, expect, it, vi } from "vitest";
import type { ExamReviewSheet } from "./exam-review";
import { createSharedReview, loadSharedReview } from "./shared-review-client";

function createClient() {
  const rpc = vi.fn().mockResolvedValue({ data: { slug: "review-123" }, error: null });
  return { client: { rpc }, rpc };
}

const sheet: ExamReviewSheet = {
  title: "Lecture Review",
  topics: [
    {
      topic: "Retrieval",
      keyIdeas: ["Retrieve context first."],
      formulaOrProcedure: "",
      commonConfusion: "Retrieval is not training.",
      sourceNote: "Page 1",
      relatedMistakeIds: ["mistake-1"],
      mistakeFocus: "Review the sequence.",
    },
  ],
};

describe("shared review client", () => {
  it("creates a review artifact through the owner RPC", async () => {
    const { client, rpc } = createClient();

    await expect(createSharedReview(client, sheet, { slug: "review-123" })).resolves.toEqual({
      slug: "review-123",
    });
    expect(rpc).toHaveBeenCalledWith(
      "create_shared_review_sheet",
      expect.objectContaining({ p_slug: "review-123", p_review: expect.any(Object) }),
    );
  });

  it("refreshes the signed-in session before creating a review link", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { slug: "review-123" }, error: null });
    const getSession = vi.fn().mockResolvedValue({ data: { session: { access_token: "fresh" } } });

    await createSharedReview({ rpc, auth: { getSession } }, sheet, { slug: "review-123" });

    expect(getSession).toHaveBeenCalledTimes(1);
  });

  it("asks the learner to sign in instead of calling the protected RPC anonymously", async () => {
    const rpc = vi.fn();
    await expect(
      createSharedReview({ rpc, auth: { getSession: vi.fn().mockResolvedValue({ data: { session: null } }) } }, sheet),
    ).rejects.toThrow("Sign in before sharing a review.");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("loads only the public review artifact", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { title: "Lecture Review", topics: [] },
      error: null,
    });
    const result = await loadSharedReview({ rpc }, "review-123");

    expect(result).toEqual({ title: "Lecture Review", topics: [] });
    expect(rpc).toHaveBeenCalledWith("get_shared_review_sheet", { p_slug: "review-123" });
  });
});
