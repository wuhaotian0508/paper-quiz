// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

const { create } = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("stripe", () => ({
  default: class {
    checkout = { sessions: { create } };
  },
}));
vi.mock("server-only", () => ({}));

import { POST } from "./route";

const originalKey = process.env.STRIPE_SECRET_KEY;
afterEach(() => {
  process.env.STRIPE_SECRET_KEY = originalKey;
  create.mockReset();
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
