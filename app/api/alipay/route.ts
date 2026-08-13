import { alipayEventId, getAlipayPayUrl, renderPayQrCode } from "@/lib/alipay";
import { balanceOf } from "@/lib/credit-ledger";
import { MAX_RMB_TOPUP, rmbToCents } from "@/lib/credit-options";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { getSupabaseServerClient } from "@/lib/supabase/server";

function error(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

export const maxDuration = 15;

const CREDIT_TABLE = "paper_quiz_credit_entries";

/**
 * Who the credit is for. Read from the session cookie, never the request body — same reason
 * as the Stripe checkout route: an id sent by the browser would name someone else's account.
 */
async function signedInLearner(): Promise<string | null> {
  try {
    const supabase = await getSupabaseServerClient();
    const { data } = await supabase.auth.getUser();
    return data.user?.id ?? null;
  } catch {
    return null;
  }
}

/**
 * The receive code to scan.
 *
 * Served from the server rather than inlined into the page so the link stays a plain
 * environment variable, and so a deployment that has not set one answers 503 instead of
 * drawing an empty box.
 */
export async function GET() {
  const payUrl = getAlipayPayUrl();
  if (!payUrl) return error("Alipay top-up is not configured on this deployment.", 503);

  try {
    return Response.json({ payUrl, qrDataUrl: await renderPayQrCode(payUrl) });
  } catch (cause) {
    console.error(
      "Alipay QR could not be rendered",
      cause instanceof Error ? cause.message : "unknown error",
    );
    return error("The payment code could not be drawn. Please try again.", 502);
  }
}

/**
 * Records a top-up the learner says they have paid.
 *
 * Unlike the Stripe webhook, nothing here has seen the money: a personal receive code sends
 * no callback, so this trusts the button. It is enough to demonstrate the flow end to end and
 * is deliberately not wired to anything that gates access — practice stays free — but it must
 * not be mistaken for billing. `docs/alipay-credit.md` says what would have to change first.
 *
 * The amount arrives from the browser here, unlike the Stripe route, because the receive code
 * carries no amount and the payer types it into Alipay themselves — there is no server-side
 * figure this could be checked against. What it can do is reject one that could not have been
 * paid through a static code at all, which is what the cap is.
 */
export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const amountInCents = rmbToCents(form.get("rmb"));
    if (!amountInCents) {
      return error(`Enter an amount between ¥1 and ¥${MAX_RMB_TOPUP}.`, 400);
    }

    if (!getAlipayPayUrl()) return error("Alipay top-up is not configured.", 503);

    const userId = await signedInLearner();
    if (!userId) return error("Sign in first — credit is held against your account.", 401);

    // The ledger grants no insert to `authenticated`, so even a demo write goes through the
    // service role. See lib/supabase/admin.ts.
    const supabase = getSupabaseAdminClient();
    if (!supabase) return error("Credit storage is not configured.", 503);

    const { error: writeError } = await supabase.from(CREDIT_TABLE).insert({
      user_id: userId,
      amount_cents: amountInCents,
      currency: "usd",
      kind: "topup",
      stripe_event_id: alipayEventId(),
      stripe_session_id: null,
      stripe_payment_intent_id: null,
    });
    if (writeError) throw new Error(writeError.message);

    // Returned with the write so the panel can show the new balance without a second read
    // that might land before this row is visible.
    const { data } = await supabase.from(CREDIT_TABLE).select("amount_cents").eq("user_id", userId);

    return Response.json({ creditedCents: amountInCents, balanceCents: balanceOf(data ?? []) });
  } catch (cause) {
    console.error(
      "Alipay top-up could not be recorded",
      cause instanceof Error ? cause.message : "unknown error",
    );
    return error("Your top-up could not be recorded. Please try again.", 502);
  }
}
