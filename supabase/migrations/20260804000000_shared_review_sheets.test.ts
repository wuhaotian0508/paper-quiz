import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20260804000000_shared_review_sheets.sql", "utf8");

describe("shared review sheet migration", () => {
  it("keeps review artifacts separate and owner-scoped", () => {
    expect(migration).toContain("create table public.paper_quiz_shared_review_sheets");
    expect(migration).toContain("review jsonb not null");
    expect(migration).toContain("alter table public.paper_quiz_shared_review_sheets enable row level security");
    expect(migration).toContain("Users manage their own shared review sheets");
  });

  it("exposes only bounded RPC access to anonymous readers", () => {
    expect(migration).toContain("create or replace function public.get_shared_review_sheet");
    expect(migration).toContain("create or replace function public.create_shared_review_sheet");
    expect(migration).toContain("security definer");
    expect(migration).toContain("grant execute on function public.get_shared_review_sheet(text) to anon, authenticated;");
  });
});
