import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * A Supabase client for the one caller that has no user session: the Stripe webhook.
 *
 * Stripe posts as Stripe, not as the learner who paid, so the write that records their
 * credit cannot go through the cookie-scoped client every other route uses. The service role
 * bypasses RLS, which is exactly why nothing else may import this: the ledger grants no
 * insert to anon or authenticated, so this key is the only thing that can create credit.
 *
 * Null rather than throwing, so a deployment without the key answers "not configured"
 * instead of crashing on a request it was never going to be able to serve.
 */
export function getSupabaseAdminClient(
  env: { url?: string; serviceRoleKey?: string } = {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  },
) {
  if (!env.url || !env.serviceRoleKey) return null;

  return createClient(env.url, env.serviceRoleKey, {
    // A webhook is a one-shot request; there is no session to persist or refresh.
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
