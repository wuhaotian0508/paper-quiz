import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * A Supabase client for the callers that cannot write as the learner: the Stripe webhook,
 * which posts as Stripe rather than as the person who paid, and the Alipay top-up route,
 * whose row has no Stripe session behind it at all.
 *
 * Either way the write that records credit cannot go through the cookie-scoped client every
 * other route uses. The service role bypasses RLS, which is exactly why nothing beyond those
 * two may import this: the ledger grants no insert to anon or authenticated, so this key is
 * the only thing that can create credit.
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
