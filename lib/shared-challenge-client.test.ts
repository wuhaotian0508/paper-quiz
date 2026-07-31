import { describe, expect, it, vi } from "vitest";
import type { Quiz } from "@/lib/quiz";
import {
  createSharedChallenge,
  loadSharedChallenge,
  submitSharedChallenge,
  type SharedChallengeClient,
} from "@/lib/shared-challenge-client";

const quiz: Quiz = {
  title: "Shared probability quiz",
  summary: "Review together.",
  questions: [
    {
      id: "q1",
      type: "multiple_choice",
      prompt: "Pick B.",
      explanation: "B is correct.",
      sourceNote: "Private lecture note",
      options: [
        { id: "a", text: "A" },
        { id: "b", text: "B" },
        { id: "c", text: "C" },
        { id: "d", text: "D" },
      ],
      correctOptionId: "b",
    },
  ],
};

function createClient(data: unknown = { slug: "share-123" }) {
  const rpc = vi.fn().mockResolvedValue({ data, error: null });
  return { client: { rpc } as SharedChallengeClient, rpc };
}

describe("shared challenge client", () => {
  it("creates a challenge through the database function without placing answers in public quiz data", async () => {
    const { client, rpc } = createClient();

    const created = await createSharedChallenge(client, quiz, {
      slug: "share-123",
      expiresAt: "2026-08-01T00:00:00.000Z",
    });

    expect(created).toEqual({ slug: "share-123" });
    expect(rpc).toHaveBeenCalledWith(
      "create_shared_challenge",
      expect.objectContaining({
        p_slug: "share-123",
        p_expires_at: "2026-08-01T00:00:00.000Z",
        p_public_quiz: expect.not.stringMatching(/correctOptionId/),
      }),
    );
    const call = rpc.mock.calls[0][1] as { p_public_quiz: object; p_answer_key: object };
    expect(JSON.stringify(call.p_public_quiz)).not.toContain("correctOptionId");
    expect(JSON.stringify(call.p_answer_key)).toContain("correctOptionId");
  });

  it("loads the public quiz through a token-only RPC", async () => {
    const publicChallenge = { slug: "share-123", title: quiz.title, quiz: { questions: [] } };
    const { client, rpc } = createClient(publicChallenge);

    await expect(loadSharedChallenge(client, "share-123")).resolves.toEqual(publicChallenge);
    expect(rpc).toHaveBeenCalledWith("get_shared_challenge", { p_slug: "share-123" });
  });

  it("submits answers through the RPC instead of reading the private answer key", async () => {
    const { client, rpc } = createClient({ score: 1, results: [] });

    await expect(
      submitSharedChallenge(client, "share-123", { q1: "b" }, "Ada"),
    ).resolves.toEqual({ score: 1, results: [] });
    expect(rpc).toHaveBeenCalledWith("submit_shared_challenge_attempt", {
      p_slug: "share-123",
      p_answers: { q1: "b" },
      p_display_name: "Ada",
    });
  });
});
