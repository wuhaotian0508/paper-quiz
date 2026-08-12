import { CHECKOUT_INTEGRATION_ID, findCreditOption, getStripe } from "@/lib/stripe";
import { getSupabaseServerClient } from "@/lib/supabase/server";

function error(message: string, status: number) {
  return Response.json({ error: message }, { status });
}
export const maxDuration = 30;

/**
 * Who the credit is for.
 *
 * Read from the session cookie, never from the request body: an id sent by the browser would
 * let anyone put their payment - or someone else's refund - on another learner's account.
 * Null covers both "signed out" and "Supabase unconfigured", which come to the same thing
 * here, since neither leaves an account to hold the credit against.
 */
async function signedInLearner(): Promise<{ id: string; email: string | null } | null> {
  try {
    const supabase = await getSupabaseServerClient();
    const { data } = await supabase.auth.getUser();
    return data.user ? { id: data.user.id, email: data.user.email ?? null } : null;
  } catch {
    return null;
  }
}

/**
 * Starts a Stripe Checkout session for prepaid credit.
 *
 * Hosted Checkout rather than an embedded form: Stripe then owns the card fields, so no
 * payment details reach this app or its logs. The amount is looked up from a fixed server
 * list — taking it from the request body would let anyone name their own price. Nothing is
 * credited here; the webhook does that, once Stripe says the money actually arrived.
 */
export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const option = findCreditOption(form.get("option"));
    if (!option) return error("Choose one of the available credit amounts.", 400);

    const learner = await signedInLearner();
    if (!learner) return error("Sign in first — credit is held against your account.", 401);

    const stripe = getStripe();
    if (!stripe) return error("Payments are not configured on this deployment.", 503);

    const origin = new URL(request.url).origin;
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      integration_identifier: CHECKOUT_INTEGRATION_ID,
      client_reference_id: learner.id,
      // Saves the learner retyping an address Stripe would only email the receipt to.
      customer_email: learner.email ?? undefined,
      // The payer is stamped on the session and on the charge. A refund event names only the
      // payment, so without the second copy a reversal has no learner to take credit back from.
      metadata: { user_id: learner.id },
      payment_intent_data: { metadata: { user_id: learner.id } },
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: option.amountInCents,
            product_data: {
              name: `PaperQuiz AI credit ${option.label}`,
              description:
                "Prepaid credit. Practice is unlimited and free today; credit applies when billing is switched on.",
            },
          },
        },
      ],
      success_url: `${origin}/?checkout=success`,
      cancel_url: `${origin}/?checkout=cancelled`,
    });

    if (!session.url) return error("Stripe did not return a checkout link. Please try again.", 502);
    return Response.json({ url: session.url });
  } catch (cause) {
    console.error("Checkout failed", cause instanceof Error ? cause.message : "unknown error");
    return error("Checkout could not be started. Please try again later.", 502);
  }
}
