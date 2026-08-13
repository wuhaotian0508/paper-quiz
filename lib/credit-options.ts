/**
 * Shared with the browser, so it carries no secret and imports no server-only module.
 * `lib/stripe.ts` is the server's copy and the one that decides what a card is actually
 * charged; a price sent from the client would let anyone name their own.
 *
 * Alipay is the exception, and deliberately so. The receive code carries no amount, so the
 * payer types the figure into Alipay themselves — a fixed server-side price list would be
 * fiction there, describing a payment this app never got to shape. What the ledger can do is
 * refuse a figure that is not a plausible top-up at all, which is what `rmbToCents` is for.
 */
export const CREDIT_OPTIONS = [
  { id: "credit_2", label: "$2", rmbLabel: "¥14", rmb: 14 },
  { id: "credit_5", label: "$5", rmbLabel: "¥35", rmb: 35 },
  { id: "credit_10", label: "$10", rmbLabel: "¥70", rmb: 70 },
] as const;

/**
 * Fixed and deliberately round, rather than a live rate.
 *
 * The ledger stores dollars, so a rate that drifted would leave two learners who paid the
 * same yuan holding different credit, and neither could tell why. Being a few percent off a
 * market rate is the price of that, and it is the cheaper of the two.
 */
export const RMB_PER_USD = 7;

/**
 * The most a single top-up may claim.
 *
 * A static receive code is capped by the payment rules at ¥500 per payer per day, so anything
 * above it could not have been paid through this code in one go. It doubles as a limit on how
 * far a mistyped figure — or a bored learner — can move the number.
 */
export const MAX_RMB_TOPUP = 500;

/**
 * Yuan as the learner typed them, into the cents the ledger stores. Null for anything that is
 * not a top-up worth recording: blank, not a number, zero or negative, over the cap, or so
 * small it rounds away to nothing.
 */
export function rmbToCents(input: unknown): number | null {
  const text = typeof input === "number" ? String(input) : String(input ?? "").trim();
  if (!text) return null;

  const yuan = Number(text);
  if (!Number.isFinite(yuan) || yuan <= 0 || yuan > MAX_RMB_TOPUP) return null;

  const cents = Math.round((yuan / RMB_PER_USD) * 100);
  return cents > 0 ? cents : null;
}
