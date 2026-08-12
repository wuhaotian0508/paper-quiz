// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getUser, eq, select, from } = vi.hoisted(() => {
  const eq = vi.fn();
  const select = vi.fn(() => ({ eq }));
  return { getUser: vi.fn(), eq, select, from: vi.fn(() => ({ select })) };
});

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServerClient: async () => ({ auth: { getUser }, from }),
}));

import { GET } from "./route";

beforeEach(() => {
  getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
  eq.mockResolvedValue({ data: [], error: null });
});
afterEach(() => vi.clearAllMocks());

describe("GET /api/credit", () => {
  it("sums the learner's ledger into a balance", async () => {
    eq.mockResolvedValue({
      data: [{ amount_cents: 500 }, { amount_cents: 1000 }, { amount_cents: -200 }],
      error: null,
    });

    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ balanceCents: 1300 });
  });

  it("reads an empty ledger as no credit", async () => {
    expect(await (await GET()).json()).toEqual({ balanceCents: 0 });
  });

  it("only ever asks for the caller's own rows", async () => {
    await GET();
    expect(eq).toHaveBeenCalledWith("user_id", "user-1");
  });

  it("has no balance to show when nobody is signed in", async () => {
    getUser.mockResolvedValue({ data: { user: null } });

    const response = await GET();

    expect(response.status).toBe(401);
    expect(from).not.toHaveBeenCalled();
  });

  it("reports a failed read rather than answering zero", async () => {
    eq.mockResolvedValue({ data: null, error: { message: "connection failure" } });

    expect((await GET()).status).toBe(502);
  });
});
