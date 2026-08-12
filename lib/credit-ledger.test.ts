import { describe, expect, it } from "vitest";
import { balanceOf, formatCredit, readRefund, readTopUp } from "@/lib/credit-ledger";

function sessionEvent(
  overrides: Record<string, unknown> = {},
  type = "checkout.session.completed",
) {
  return {
    id: "evt_1",
    type,
    data: {
      object: {
        id: "cs_test_1",
        payment_status: "paid",
        client_reference_id: "user-1",
        amount_total: 500,
        currency: "usd",
        payment_intent: "pi_1",
        ...overrides,
      },
    },
  };
}

function refundEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: "evt_2",
    type: "refund.created",
    data: {
      object: {
        id: "re_1",
        status: "succeeded",
        amount: 200,
        currency: "usd",
        payment_intent: "pi_1",
        ...overrides,
      },
    },
  };
}

describe("readTopUp", () => {
  it("reads a paid checkout as credit for the learner who started it", () => {
    expect(readTopUp(sessionEvent())).toEqual({
      userId: "user-1",
      amountCents: 500,
      currency: "usd",
      kind: "topup",
      eventId: "evt_1",
      sessionId: "cs_test_1",
      paymentIntentId: "pi_1",
    });
  });

  it("credits a delayed payment method only once the money arrives", () => {
    const pending = sessionEvent({ payment_status: "unpaid" });
    expect(readTopUp(pending)).toBeNull();

    const settled = sessionEvent({}, "checkout.session.async_payment_succeeded");
    expect(readTopUp(settled)?.amountCents).toBe(500);
  });

  it("falls back to metadata when Stripe omits the client reference", () => {
    const event = sessionEvent({ client_reference_id: null, metadata: { user_id: "user-2" } });
    expect(readTopUp(event)?.userId).toBe("user-2");
  });

  it("refuses a payment it cannot attribute rather than guessing an owner", () => {
    expect(readTopUp(sessionEvent({ client_reference_id: null, metadata: {} }))).toBeNull();
  });

  it("ignores a session that charged nothing", () => {
    expect(readTopUp(sessionEvent({ amount_total: 0 }))).toBeNull();
  });

  it("reads an expanded payment intent as well as a bare id", () => {
    expect(readTopUp(sessionEvent({ payment_intent: { id: "pi_9" } }))?.paymentIntentId).toBe(
      "pi_9",
    );
  });

  it("ignores events it is not responsible for", () => {
    expect(readTopUp(sessionEvent({}, "checkout.session.expired"))).toBeNull();
  });
});

describe("readRefund", () => {
  it("reads a succeeded refund and the payment it reverses", () => {
    expect(readRefund(refundEvent())).toEqual({
      eventId: "evt_2",
      amountCents: 200,
      currency: "usd",
      paymentIntentId: "pi_1",
    });
  });

  it("waits for a pending refund to actually succeed", () => {
    expect(readRefund(refundEvent({ status: "pending" }))).toBeNull();
  });

  it("ignores a refund with no payment to trace it back to", () => {
    expect(readRefund(refundEvent({ payment_intent: null }))).toBeNull();
  });
});

describe("balanceOf", () => {
  it("nets refunds against top-ups", () => {
    expect(balanceOf([{ amount_cents: 500 }, { amount_cents: 1000 }, { amount_cents: -200 }])).toBe(
      1300,
    );
  });

  it("reads an empty ledger as no credit", () => {
    expect(balanceOf([])).toBe(0);
  });
});

describe("formatCredit", () => {
  it("shows credit in dollars", () => {
    expect(formatCredit(0)).toBe("$0.00");
    expect(formatCredit(500)).toBe("$5.00");
    expect(formatCredit(1234)).toBe("$12.34");
  });

  it("keeps a negative balance visible rather than dropping the sign", () => {
    expect(formatCredit(-250)).toBe("-$2.50");
  });
});
