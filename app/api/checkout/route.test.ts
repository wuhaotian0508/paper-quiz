// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { create, getUser } = vi.hoisted(() => ({ create: vi.fn(), getUser: vi.fn() }));
vi.mock("stripe", () => ({
  default: class {
    checkout = { sessions: { create } };
  },
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServerClient: async () => ({ auth: { getUser } }),
}));

import { POST } from "./route";

const originalKey = process.env.STRIPE_SECRET_KEY;
beforeEach(() => {
  getUser.mockResolvedValue({ data: { user: { id: "user-1", email: "learner@example.com" } } });
});
afterEach(() => {
  process.env.STRIPE_SECRET_KEY = originalKey;
  create.mockReset();
  getUser.mockReset();
});

function request(option?: string) {
  const form = new FormData();
  if (option !== undefined) form.set("option", option);
  return new Request("http://localhost/api/checkout", { method: "POST", body: form });
}

describe("POST /api/checkout", () => {
  it("starts a hosted checkout for a known credit amount", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_123";
    create.mockResolvedValue({ url: "https://checkout.stripe.com/c/pay/abc" });

    const response = await POST(request("credit_5"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ url: "https://checkout.stripe.com/c/pay/abc" });
    const [params] = create.mock.calls[0];
    expect(params.mode).toBe("payment");
    expect(params.line_items[0].price_data.unit_amount).toBe(500);
  });

  it("stamps the payer on the session and the charge, so credit and refunds find them", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_123";
    create.mockResolvedValue({ url: "https://checkout.stripe.com/c/pay/abc" });

    await POST(request("credit_5"));

    const [params] = create.mock.calls[0];
    expect(params.client_reference_id).toBe("user-1");
    expect(params.metadata.user_id).toBe("user-1");
    expect(params.payment_intent_data.metadata.user_id).toBe("user-1");
    expect(params.customer_email).toBe("learner@example.com");
  });

  it("takes the payer from the session, never from the request", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_123";
    create.mockResolvedValue({ url: "https://checkout.stripe.com/c/pay/abc" });

    const form = new FormData();
    form.set("option", "credit_5");
    form.set("user_id", "somebody-else");
    await POST(new Request("http://localhost/api/checkout", { method: "POST", body: form }));

    expect(create.mock.calls[0][0].client_reference_id).toBe("user-1");
  });

  it("refuses a purchase with no account to credit", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_123";
    getUser.mockResolvedValue({ data: { user: null } });

    const response = await POST(request("credit_5"));

    expect(response.status).toBe(401);
    expect(create).not.toHaveBeenCalled();
  });

  it("prices from the server list, so a request cannot name its own amount", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_123";

    const response = await POST(request("credit_1000000"));

    expect(response.status).toBe(400);
    expect(create).not.toHaveBeenCalled();
  });

  it("rejects a request with no amount chosen", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_123";
    expect((await POST(request())).status).toBe(400);
  });

  it("reports a deployment with no Stripe key instead of crashing", async () => {
    process.env.STRIPE_SECRET_KEY = "";
    const response = await POST(request("credit_5"));
    expect(response.status).toBe(503);
    expect(create).not.toHaveBeenCalled();
  });

  it("surfaces a Stripe failure as a server error", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_123";
    create.mockRejectedValue(new Error("card_declined"));
    expect((await POST(request("credit_5"))).status).toBe(502);
  });
});
