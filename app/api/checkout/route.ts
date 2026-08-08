import { findCreditOption, getStripe } from "@/lib/stripe";

function error(message: string, status: number) {
  return Response.json({ error: message }, { status });
}
export const maxDuration = 30;

/**
 * Starts a Stripe Checkout session for prepaid credit.
 *
 * Hosted Checkout rather than an embedded form: Stripe then owns the card fields, so no
 * payment details reach this app or its logs. The amount is looked up from a fixed server
 * list — taking it from the request body would let anyone name their own price.
 */
export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const option = findCreditOption(form.get("option"));
    if (!option) return error("Choose one of the available credit amounts.", 400);

    const stripe = getStripe();
    if (!stripe) return error("Payments are not configured on this deployment.", 503);

    const origin = new URL(request.url).origin;
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
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
