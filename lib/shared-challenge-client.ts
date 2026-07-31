import type { Quiz } from "@/lib/quiz";
import { buildSharedChallenge } from "@/lib/shared-challenge";

type RpcResult<T> = PromiseLike<{ data: T | null; error: { message: string } | null }>;

export type SharedChallengeClient = {
  rpc: <T>(functionName: string, parameters: Record<string, unknown>) => RpcResult<T>;
};

export type SharedChallengeCreateOptions = {
  slug?: string;
  expiresAt?: string | null;
};

export function createChallengeSlug() {
  return crypto.randomUUID().replaceAll("-", "").slice(0, 16);
}

export async function createSharedChallenge(
  client: SharedChallengeClient,
  quiz: Quiz,
  { slug = createChallengeSlug(), expiresAt = null }: SharedChallengeCreateOptions = {},
): Promise<{ slug: string }> {
  const { publicQuiz, answerKey } = buildSharedChallenge(quiz);
  const data = await callRpc<{ slug?: unknown }>(client, "create_shared_challenge", {
    p_slug: slug,
    p_public_quiz: publicQuiz,
    p_answer_key: answerKey,
    p_expires_at: expiresAt,
  });
  if (!data || typeof data.slug !== "string") throw new Error("Challenge could not be created.");
  return { slug: data.slug };
}

export async function loadSharedChallenge(client: SharedChallengeClient, slug: string) {
  return callRpc<object>(client, "get_shared_challenge", { p_slug: slug });
}

export async function submitSharedChallenge(
  client: SharedChallengeClient,
  slug: string,
  answers: Record<string, string>,
  displayName: string,
) {
  return callRpc<object>(client, "submit_shared_challenge_attempt", {
    p_slug: slug,
    p_answers: answers,
    p_display_name: displayName.trim().slice(0, 80),
  });
}

async function callRpc<T>(
  client: SharedChallengeClient,
  functionName: string,
  parameters: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await client.rpc<T>(functionName, parameters);
  if (error) throw new Error(error.message);
  if (data === null) throw new Error("Challenge is unavailable.");
  return data;
}
