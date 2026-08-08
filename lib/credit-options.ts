/**
 * Shared with the browser, so it carries no secret and imports no server-only module.
 * `lib/stripe.ts` is the server's copy and the one that decides what is actually charged;
 * a price sent from the client would let anyone name their own.
 */
export const CREDIT_OPTIONS = [
  { id: "credit_2", label: "$2" },
  { id: "credit_5", label: "$5" },
  { id: "credit_10", label: "$10" },
] as const;
