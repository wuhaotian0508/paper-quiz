// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { insert, select, eq, getUser, adminClient } = vi.hoisted(() => {
  const insert = vi.fn();
  const eq = vi.fn();
  const select = vi.fn(() => ({ eq }));
  const getUser = vi.fn();
  const adminClient = vi.fn();
  return { insert, select, eq, getUser, adminClient };
});

vi.mock("server-only", () => ({}));
vi.mock("qrcode", () => ({ default: { toDataURL: async () => "data:image/png;base64,QR" } }));
vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServerClient: async () => ({ auth: { getUser } }),
}));
vi.mock("@/lib/supabase/admin", () => ({ getSupabaseAdminClient: adminClient }));

import { GET, POST } from "./route";

const originalUrl = process.env.ALIPAY_QR_URL;
beforeEach(() => {
  process.env.ALIPAY_QR_URL = "https://qr.alipay.com/test";
  getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
  insert.mockResolvedValue({ error: null });
  eq.mockResolvedValue({ data: [{ amount_cents: 500 }], error: null });
  adminClient.mockReturnValue({ from: () => ({ insert, select }) });
});
afterEach(() => {
  process.env.ALIPAY_QR_URL = originalUrl;
  vi.clearAllMocks();
});

function request(rmb?: string) {
  const form = new FormData();
  if (rmb !== undefined) form.set("rmb", rmb);
  return new Request("http://localhost/api/alipay", { method: "POST", body: form });
}

describe("GET /api/alipay", () => {
  it("draws the configured receive code", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      payUrl: "https://qr.alipay.com/test",
      qrDataUrl: "data:image/png;base64,QR",
    });
  });

  it("reports a deployment with no receive code instead of drawing an empty one", async () => {
    process.env.ALIPAY_QR_URL = "";
    expect((await GET()).status).toBe(503);
  });
});

describe("POST /api/alipay", () => {
  it("records the top-up and answers with the new balance", async () => {
    const response = await POST(request("35"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ creditedCents: 500, balanceCents: 500 });
    const [row] = insert.mock.calls[0];
    expect(row.user_id).toBe("user-1");
    expect(row.amount_cents).toBe(500);
    expect(row.kind).toBe("topup");
  });

  it("takes an amount off the preset list, since the code accepts any figure", async () => {
    await POST(request("23.50"));
    // 23.50 / 7, to the nearest cent.
    expect(insert.mock.calls[0][0].amount_cents).toBe(336);
  });

  it("marks the row as one nobody verified, so the table stays readable", async () => {
    await POST(request("35"));
    expect(insert.mock.calls[0][0].stripe_event_id).toMatch(/^alipay_manual_/);
  });

  it.each(["0", "-35", "abc", "", "501"])(
    "rejects %o rather than writing a row that money could not explain",
    async (rmb) => {
      const response = await POST(request(rmb));
      expect(response.status).toBe(400);
      expect(insert).not.toHaveBeenCalled();
    },
  );

  it("takes the payer from the session, never from the request", async () => {
    const form = new FormData();
    form.set("rmb", "35");
    form.set("user_id", "somebody-else");
    await POST(new Request("http://localhost/api/alipay", { method: "POST", body: form }));

    expect(insert.mock.calls[0][0].user_id).toBe("user-1");
  });

  it("refuses a top-up with no account to credit", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    expect((await POST(request("35"))).status).toBe(401);
    expect(insert).not.toHaveBeenCalled();
  });

  it("refuses to record anything when no receive code is configured", async () => {
    process.env.ALIPAY_QR_URL = "";
    expect((await POST(request("35"))).status).toBe(503);
    expect(insert).not.toHaveBeenCalled();
  });

  it("surfaces a failed write instead of claiming the credit landed", async () => {
    insert.mockResolvedValue({ error: { message: "connection reset" } });
    expect((await POST(request("35"))).status).toBe(502);
  });
});
