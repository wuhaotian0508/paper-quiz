import { readRefund, readTopUp, type CreditEntry } from "@/lib/credit-ledger";
import { getStripe, getStripeWebhookSecret } from "@/lib/stripe";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 30;

const CREDIT_TABLE = "paper_quiz_credit_entries";
/** Postgres unique violation. Here it means Stripe delivered an event we already recorded. */
const ALREADY_RECORDED = "23505";

type SupabaseAdmin = NonNullable<ReturnType<typeof getSupabaseAdminClient>>;

/**
 * Writes one ledger row, treating a redelivery as success.
 *
 * Stripe guarantees at-least-once delivery and retries anything not acknowledged, so the
 * second copy of an event must be a no-op rather than a second credit. The unique index on
 * the event id is what enforces that; this only has to read the conflict as "already done".
 */
async function record(supabase: SupabaseAdmin, entry: CreditEntry): Promise<"recorded" | "repeat"> {
  const { error } = await supabase.from(CREDIT_TABLE).insert({
    user_id: entry.userId,
    amount_cents: entry.amountCents,
    currency: entry.currency,
    kind: entry.kind,
    stripe_event_id: entry.eventId,
    stripe_session_id: entry.sessionId,
    stripe_payment_intent_id: entry.paymentIntentId,
  });

  if (!error) return "recorded";
  if (error.code === ALREADY_RECORDED) return "repeat";
  throw new Error(error.message);
}

/**
 * The learner a refund belongs to, found through the top-up it reverses.
 *
 * A refund event names the payment, not the payer, and the charge metadata can only be
 * trusted as far as the checkout that set it — so the ledger's own record of that payment is
 * the safer source. Null when we never recorded the top-up, which is the one case where
 * skipping the refund keeps the books right: a balance that never gained the credit must not
 * lose it.
 */
async function payerOf(supabase: SupabaseAdmin, paymentIntentId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from(CREDIT_TABLE)
    .select("user_id")
    .eq("stripe_payment_intent_id", paymentIntentId)
    .eq("kind", "topup")
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  const userId = (data as { user_id?: string } | null)?.user_id;
  return userId ?? null;
}

/**
 * Records a refund as a negative entry against the payer of the original charge.
 *
 * Netted rather than subtracted from a stored total, so a partial refund, a second partial
 * refund and a redelivery of either all land on a balance that is still the sum of the rows.
 */
async function recordRefund(
  supabase: SupabaseAdmin,
  refund: NonNullable<ReturnType<typeof readRefund>>,
): Promise<"recorded" | "repeat" | "unknown-payer"> {
  const userId = await payerOf(supabase, refund.paymentIntentId);
  if (!userId) return "unknown-payer";

  return record(supabase, {
    userId,
    amountCents: -refund.amountCents,
    currency: refund.currency,
    kind: "refund",
    eventId: refund.eventId,
    sessionId: null,
    paymentIntentId: refund.paymentIntentId,
  });
}

/**
 * Receives Stripe's account of what was actually paid.
 *
 * The redirect back from Checkout is a browser navigation and proves nothing — a learner can
 * type it, and a closed tab skips it — so this endpoint, and only this endpoint, is what
 * moves credit. Every body is verified against the signing secret before it is read.
 */
export async function POST(request: Request) {
  const stripe = getStripe();
  const secret = getStripeWebhookSecret();
  if (!stripe || !secret) {
    return Response.json({ error: "Payments are not configured." }, { status: 503 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) return Response.json({ error: "Missing signature." }, { status: 400 });

  // The raw bytes, not a parsed body: the signature covers exactly what Stripe sent, and
  // re-serialising JSON would change it.
  const payload = await request.text();

  let event;
  try {
    event = await stripe.webhooks.constructEventAsync(payload, signature, secret);
  } catch (cause) {
    // Either not from Stripe, or replayed long enough after the fact to be outside the
    // signature's tolerance. Never a reason to retry, so it is a 400 rather than a 500.
    console.error(
      "Stripe webhook rejected",
      cause instanceof Error ? cause.message : "unknown error",
    );
    return Response.json({ error: "Signature verification failed." }, { status: 400 });
  }

  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    console.error("Stripe webhook could not record credit: Supabase service role not configured");
    // 500, so Stripe keeps retrying: the money was taken and the credit is still owed.
    return Response.json({ error: "Credit storage is not configured." }, { status: 500 });
  }

  try {
    const topUp = readTopUp(event);
    if (topUp) {
      const outcome = await record(supabase, topUp);
      console.warn(`Stripe credit ${outcome}`, event.id, topUp.amountCents);
      return Response.json({ received: true, outcome });
    }

    const refund = readRefund(event);
    if (refund) {
      const outcome = await recordRefund(supabase, refund);
      console.warn(`Stripe refund ${outcome}`, event.id, refund.amountCents);
      return Response.json({ received: true, outcome });
    }

    // Everything else Stripe is configured to send: acknowledged so it is not retried.
    return Response.json({ received: true, outcome: "ignored" });
  } catch (cause) {
    console.error(
      "Stripe webhook could not be recorded",
      cause instanceof Error ? cause.message : "unknown error",
    );
    // 500 asks Stripe to redeliver. A paid-for credit that failed to store is worth retrying;
    // the event id keeps the retry from double-crediting if the write actually landed.
    return Response.json({ error: "Could not record the payment." }, { status: 500 });
  }
}
