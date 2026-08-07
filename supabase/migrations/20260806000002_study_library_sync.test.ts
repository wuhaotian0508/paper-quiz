import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260806000002_study_library_sync.sql",
  "utf8",
);

describe("study library sync migration", () => {
  it("allows signed-in users to read and write their own library", () => {
    expect(migration).toContain(
      "grant select, insert, update, delete on table public.paper_quiz_library to authenticated;",
    );
  });

  it("scopes every row to its owner", () => {
    expect(migration).toContain("alter table public.paper_quiz_library enable row level security;");
    expect(migration).toContain("using (auth.uid() = user_id) with check (auth.uid() = user_id)");
  });
});
