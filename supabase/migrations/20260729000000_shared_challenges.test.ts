import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20260729000000_shared_challenges.sql", "utf8");

describe("shared challenge migration", () => {
  it("keeps public questions and private answer keys in separate RLS-protected tables", () => {
    expect(migration).toContain("create table public.paper_quiz_shared_challenges");
    expect(migration).toContain("public_quiz jsonb not null");
    expect(migration).toContain("create table public.paper_quiz_shared_challenge_keys");
    expect(migration).toContain("answer_key jsonb not null");
    expect(migration).toContain("alter table public.paper_quiz_shared_challenge_keys enable row level security;");
    expect(migration).toContain("Users manage answer keys for their own challenges");
  });

  it("uses security-definer RPCs to reveal only safe data and grade answers without exposing keys", () => {
    expect(migration).toContain("create or replace function public.get_shared_challenge");
    expect(migration).toContain("create or replace function public.submit_shared_challenge_attempt");
    expect(migration).toContain("security definer");
    expect(migration).toContain("revoke all on function public.get_shared_challenge(text) from public;");
    expect(migration).toContain("grant execute on function public.get_shared_challenge(text) to anon, authenticated;");
    expect(migration).toContain("answer_key");
  });
});
