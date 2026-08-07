import type { ExamReviewSheet } from "./exam-review";
import { buildSharedReview, type SharedReviewSourcePage } from "./shared-review";

type RpcResult<T> = PromiseLike<{ data: T | null; error: { message: string } | null }>;

export type SharedReviewClient = {
  rpc: <T>(functionName: string, parameters: Record<string, unknown>) => RpcResult<T>;
  auth?: {
    getSession: () => PromiseLike<{ data: { session: { access_token?: unknown } | null } }>;
  };
};

export type SharedReviewCreateOptions = {
  slug?: string;
  expiresAt?: string | null;
  sourcePages?: SharedReviewSourcePage[];
};

export function createReviewSlug() {
  return `review-${crypto.randomUUID().replaceAll("-", "").slice(0, 13)}`;
}

export async function createSharedReview(
  client: SharedReviewClient,
  sheet: ExamReviewSheet,
  { slug = createReviewSlug(), expiresAt = null, sourcePages = [] }: SharedReviewCreateOptions = {},
): Promise<{ slug: string }> {
  // Ensure the browser client has restored the signed-in cookie before the protected RPC.
  // This avoids sending a newly opened tab through the public `anon` role.
  if (client.auth) {
    const { data } = await client.auth.getSession();
    if (!data.session?.access_token) throw new Error("Sign in before sharing a review.");
  }
  const data = await callRpc<{ slug?: unknown }>(client, "create_shared_review_sheet", {
    p_slug: slug,
    p_review: buildSharedReview(sheet, sourcePages),
    p_expires_at: expiresAt,
  });
  if (!data || typeof data.slug !== "string") throw new Error("Review link could not be created.");
  return { slug: data.slug };
}

export async function loadSharedReview(client: SharedReviewClient, slug: string) {
  return callRpc<object>(client, "get_shared_review_sheet", { p_slug: slug });
}

async function callRpc<T>(
  client: SharedReviewClient,
  functionName: string,
  parameters: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await client.rpc<T>(functionName, parameters);
  if (error) throw new Error(error.message);
  if (data === null) throw new Error("Review link is unavailable.");
  return data;
}
