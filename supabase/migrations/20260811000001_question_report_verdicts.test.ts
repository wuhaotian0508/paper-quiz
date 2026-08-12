import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { LEARNING_RULE_IDS } from "@/lib/question-verdict";

const migration = readFileSync(
  "supabase/migrations/20260811000001_question_report_verdicts.sql",
  "utf8",
);

describe("question report verdict migration", () => {
  it("adds the verdict columns without rewriting the table it extends", () => {
    expect(migration).toContain("alter table public.paper_quiz_question_reports");
    expect(migration).toContain("add column if not exists verdict text");
    expect(migration).not.toContain("create table");
    expect(migration).not.toMatch(/drop (table|column)/);
  });

  it("keeps an unchecked report a normal row", () => {
    // No `not null` anywhere: a report filed without a source to check against, or with the
    // check unavailable, is complete as it stands.
    expect(migration).not.toContain("not null");
    for (const column of ["verdict", "severity", "learning_rule", "learning_scope"])
      expect(migration).toContain(`${column} is null or`);
  });

  it("constrains the rule column to the vocabulary the generator can render", () => {
    for (const rule of LEARNING_RULE_IDS) expect(migration).toContain(`'${rule}'`);
  });

  it("indexes the confirmed serious faults triage actually reads", () => {
    expect(migration).toContain("where verdict = 'confirmed' and severity = 'critical'");
  });

  it("does not open the table for reading", () => {
    expect(migration).not.toContain("for select");
    expect(migration).not.toMatch(/grant select/);
  });
});
