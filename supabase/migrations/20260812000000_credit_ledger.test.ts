import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20260812000000_credit_ledger.sql", "utf8");

describe("credit ledger migration", () => {
  it("keeps every entry attributable to a learner", () => {
    expect(migration).toContain("create table public.paper_quiz_credit_entries");
    expect(migration).toContain(
      "user_id uuid not null references auth.users(id) on delete cascade",
    );
    expect(migration).toContain("kind text not null check (kind in ('topup', 'refund'))");
  });

  it("makes a redelivered Stripe event a no-op", () => {
    expect(migration).toContain("stripe_event_id text not null unique");
  });

  it("refuses a zero-amount entry", () => {
    expect(migration).toContain("amount_cents integer not null check (amount_cents <> 0)");
  });

  it("lets a learner read their own credit and write none of it", () => {
    expect(migration).toContain("enable row level security");
    expect(migration).toContain(
      "grant select on table public.paper_quiz_credit_entries to authenticated;",
    );
    expect(migration).toContain("for select using (user_id = auth.uid())");
    expect(migration).not.toMatch(/grant (insert|update|delete)[^;]*paper_quiz_credit_entries/);
    expect(migration).not.toContain("for insert");
  });
});
