import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20260728000000_paper_quiz_sync.sql", "utf8");

describe("paper quiz sync migration", () => {
  it("allows signed-in users to read and write their own synced data", () => {
    expect(migration).toContain(
      "grant select, insert, update, delete on table public.paper_quiz_sessions to authenticated;",
    );
    expect(migration).toContain(
      "grant select, insert, update, delete on table public.paper_quiz_mistakes to authenticated;",
    );
  });
});
