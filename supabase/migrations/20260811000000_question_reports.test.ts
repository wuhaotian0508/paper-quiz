import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20260811000000_question_reports.sql", "utf8");

describe("question report migration", () => {
  it("keeps a report usable when nobody was signed in", () => {
    expect(migration).toContain("create table public.paper_quiz_question_reports");
    expect(migration).toContain("reporter_id uuid references auth.users(id) on delete set null");
    expect(migration).toContain(
      "grant insert on table public.paper_quiz_question_reports to anon, authenticated;",
    );
  });

  it("bounds what a report may contain", () => {
    expect(migration).toContain(
      "reason text not null check (reason in ('wrong_answer', 'bad_options', 'not_in_source', 'unclear', 'other'))",
    );
    expect(migration).toContain("char_length(note) <= 500");
  });

  it("makes the reports table write-only for learners", () => {
    expect(migration).toContain("enable row level security");
    expect(migration).toContain(
      "for insert with check (reporter_id is null or reporter_id = auth.uid())",
    );
    expect(migration).not.toContain("for select");
    expect(migration).not.toMatch(/grant select on table public\.paper_quiz_question_reports/);
  });
});
