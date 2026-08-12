/**
 * Turns a Stripe event into a row of the credit ledger, and a ledger into a balance.
 *
 * Deliberately structural rather than typed against the Stripe SDK, and free of any
 * server-only import: the webhook, the balance endpoint and the settings panel all need a
 * piece of this, and the rules for what counts as credit are worth testing without a
 * network, a signature or a database in the way.
 */

export type CreditKind = "topup" | "refund";

export type CreditEntry = {
  userId: string;
  /** Positive for a top-up, negative for a refund. Always cents. */
  amountCents: number;
  currency: string;
  kind: CreditKind;
  eventId: string;
  sessionId: string | null;
  paymentIntentId: string | null;
};

type EventLike = { id?: unknown; type?: unknown; data?: { object?: unknown } };

function readRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

/** Cents, and only a positive whole number of them. A zero or partial amount is not credit. */
function readAmount(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null;
}

/** Stripe expands some references and leaves others as bare ids; accept either shape. */
function readReference(value: unknown): string | null {
  const record = readRecord(value);
  return record ? readString(record.id) : readString(value);
}

function readCurrency(value: unknown): string {
  const currency = readString(value);
  return currency && currency.length === 3 ? currency.toLowerCase() : "usd";
}

/**
 * The paid checkout of a signed-in learner, or null.
 *
 * `async_payment_succeeded` counts alongside `completed` because payment methods are chosen
 * dynamically: a bank debit completes the session first and pays days later, and only the
 * later event means money arrived. Both carry `payment_status`, so one check covers them.
 */
export function readTopUp(event: EventLike): CreditEntry | null {
  const type = readString(event.type);
  if (
    type !== "checkout.session.completed" &&
    type !== "checkout.session.async_payment_succeeded"
  ) {
    return null;
  }

  const eventId = readString(event.id);
  const session = readRecord(event.data?.object);
  if (!eventId || !session) return null;
  if (session.payment_status !== "paid") return null;

  // Set by the checkout route from the session cookie. Absent means we cannot say whose
  // credit this is, and a guess would put someone else's money on an account.
  const userId =
    readString(session.client_reference_id) ??
    readString(readRecord(session.metadata)?.user_id ?? null);
  const amountCents = readAmount(session.amount_total);
  if (!userId || !amountCents) return null;

  return {
    userId,
    amountCents,
    currency: readCurrency(session.currency),
    kind: "topup",
    eventId,
    sessionId: readString(session.id),
    paymentIntentId: readReference(session.payment_intent),
  };
}

/**
 * A refund, minus the learner it belongs to.
 *
 * `refund.created` rather than `charge.refunded`: a refund object is one increment, so two
 * partial refunds are two events of their own amounts, where the charge would report the
 * cumulative total twice and take the money back twice over.
 */
export function readRefund(
  event: EventLike,
): { eventId: string; amountCents: number; currency: string; paymentIntentId: string } | null {
  if (readString(event.type) !== "refund.created") return null;

  const eventId = readString(event.id);
  const refund = readRecord(event.data?.object);
  if (!eventId || !refund) return null;
  // A refund that failed or is still pending has taken nothing back yet.
  if (refund.status !== "succeeded") return null;

  const amountCents = readAmount(refund.amount);
  const paymentIntentId = readReference(refund.payment_intent);
  if (!amountCents || !paymentIntentId) return null;

  return { eventId, amountCents, currency: readCurrency(refund.currency), paymentIntentId };
}

/** Sums a ledger. Rows come back as the database spells them, hence the snake_case field. */
export function balanceOf(entries: { amount_cents: number }[]): number {
  return entries.reduce((total, entry) => total + entry.amount_cents, 0);
}

/** Cents to the dollars a learner reads. Credit is whole cents, so two decimals always fit. */
export function formatCredit(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  return `${sign}$${(Math.abs(cents) / 100).toFixed(2)}`;
}
