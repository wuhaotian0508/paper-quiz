// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { constructEventAsync, insert, maybeSingle, state } = vi.hoisted(() => ({
  constructEventAsync: vi.fn(),
  insert: vi.fn(),
  maybeSingle: vi.fn(),
  state: { adminConfigured: true },
}));

vi.mock("stripe", () => ({
  default: class {
    webhooks = { constructEventAsync };
  },
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdminClient: () =>
    state.adminConfigured
      ? {
          from: () => ({
            insert,
            select: () => ({
              eq: () => ({ eq: () => ({ limit: () => ({ maybeSingle }) }) }),
            }),
          }),
        }
      : null,
}));

import { POST } from "./route";

const originalKey = process.env.STRIPE_SECRET_KEY;
const originalSecret = process.env.STRIPE_WEBHOOK_SECRET;

beforeEach(() => {
  process.env.STRIPE_SECRET_KEY = "sk_test_123";
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_123";
  state.adminConfigured = true;
  insert.mockResolvedValue({ error: null });
  maybeSingle.mockResolvedValue({ data: null, error: null });
});

afterEach(() => {
  process.env.STRIPE_SECRET_KEY = originalKey;
  process.env.STRIPE_WEBHOOK_SECRET = originalSecret;
  constructEventAsync.mockReset();
  insert.mockReset();
  maybeSingle.mockReset();
});

function request(signed = true) {
  return new Request("http://localhost/api/stripe/webhook", {
    method: "POST",
    headers: signed ? { "stripe-signature": "t=1,v1=abc" } : {},
    body: "{}",
  });
}

const paidSession = {
  id: "evt_1",
  type: "checkout.session.completed",
  data: {
    object: {
      id: "cs_1",
      payment_status: "paid",
      client_reference_id: "user-1",
      amount_total: 500,
      currency: "usd",
      payment_intent: "pi_1",
    },
  },
};

const refund = {
  id: "evt_2",
  type: "refund.created",
  data: { object: { id: "re_1", status: "succeeded", amount: 200, payment_intent: "pi_1" } },
};

describe("POST /api/stripe/webhook", () => {
  it("records credit for a paid checkout", async () => {
    constructEventAsync.mockResolvedValue(paidSession);

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(insert).toHaveBeenCalledWith({
      user_id: "user-1",
      amount_cents: 500,
      currency: "usd",
      kind: "topup",
      stripe_event_id: "evt_1",
      stripe_session_id: "cs_1",
      stripe_payment_intent_id: "pi_1",
    });
  });

  it("refuses a body whose signature does not verify", async () => {
    constructEventAsync.mockRejectedValue(new Error("No signatures found matching the payload"));

    const response = await POST(request());

    expect(response.status).toBe(400);
    expect(insert).not.toHaveBeenCalled();
  });

  it("refuses an unsigned request before reading it", async () => {
    const response = await POST(request(false));

    expect(response.status).toBe(400);
    expect(constructEventAsync).not.toHaveBeenCalled();
  });

  it("treats a redelivered event as already done rather than as more credit", async () => {
    constructEventAsync.mockResolvedValue(paidSession);
    insert.mockResolvedValue({ error: { code: "23505", message: "duplicate key" } });

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: true, outcome: "repeat" });
  });

  it("asks Stripe to retry when the credit could not be stored", async () => {
    constructEventAsync.mockResolvedValue(paidSession);
    insert.mockResolvedValue({ error: { code: "08006", message: "connection failure" } });

    expect((await POST(request())).status).toBe(500);
  });

  it("asks Stripe to retry rather than dropping credit it cannot store at all", async () => {
    constructEventAsync.mockResolvedValue(paidSession);
    state.adminConfigured = false;

    expect((await POST(request())).status).toBe(500);
  });

  it("takes a refund back from the learner who paid", async () => {
    constructEventAsync.mockResolvedValue(refund);
    maybeSingle.mockResolvedValue({ data: { user_id: "user-1" }, error: null });

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "user-1",
        amount_cents: -200,
        kind: "refund",
        stripe_event_id: "evt_2",
        stripe_payment_intent_id: "pi_1",
      }),
    );
  });

  it("skips a refund of a payment it never credited, instead of inventing a debt", async () => {
    constructEventAsync.mockResolvedValue(refund);

    const response = await POST(request());

    expect(await response.json()).toEqual({ received: true, outcome: "unknown-payer" });
    expect(insert).not.toHaveBeenCalled();
  });

  it("acknowledges events it has no use for, so Stripe stops resending them", async () => {
    constructEventAsync.mockResolvedValue({
      id: "evt_3",
      type: "payment_intent.created",
      data: { object: {} },
    });

    const response = await POST(request());

    expect(await response.json()).toEqual({ received: true, outcome: "ignored" });
    expect(insert).not.toHaveBeenCalled();
  });

  it("reports a deployment with no webhook secret instead of trusting the body", async () => {
    process.env.STRIPE_WEBHOOK_SECRET = "";

    const response = await POST(request());

    expect(response.status).toBe(503);
    expect(constructEventAsync).not.toHaveBeenCalled();
  });
});
