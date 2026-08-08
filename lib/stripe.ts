import "server-only";
import Stripe from "stripe";

/**
 * Credit a learner can buy ahead of billing being switched on.
 *
 * Usage is unlimited and unbilled today, so this is prepaid credit rather than a charge for
 * anything already consumed. Amounts are fixed rather than free-entry: an arbitrary amount
 * field invites typos and gives the learner a decision they have no basis to make.
 */
export const CREDIT_OPTIONS = [
  { id: "credit_2", label: "$2", amountInCents: 200 },
  { id: "credit_5", label: "$5", amountInCents: 500 },
  { id: "credit_10", label: "$10", amountInCents: 1000 },
] as const;

export type CreditOptionId = (typeof CREDIT_OPTIONS)[number]["id"];

export function findCreditOption(id: unknown) {
  return CREDIT_OPTIONS.find((option) => option.id === id);
}

/** Null rather than throwing, so a deployment without Stripe keys degrades to "no top-up". */
export function getStripe(secretKey = process.env.STRIPE_SECRET_KEY): Stripe | null {
  return secretKey ? new Stripe(secretKey) : null;
}
