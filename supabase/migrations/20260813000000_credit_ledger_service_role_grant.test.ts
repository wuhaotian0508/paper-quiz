import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260813000000_credit_ledger_service_role_grant.sql",
  "utf8",
);

/**
 * The statements alone. The comment above them names the privileges this migration
 * deliberately withholds, so a check run against the whole file reads its own explanation as
 * the thing it is meant to forbid.
 */
const statements = migration.replaceAll(/^\s*--.*$/gm, "");

describe("credit ledger service role grant", () => {
  it("lets the one writer of credit actually write it", () => {
    expect(statements).toContain(
      "grant select, insert on table public.paper_quiz_credit_entries to service_role;",
    );
  });

  it("leaves the ledger append-only, even for the service role", () => {
    expect(statements).not.toMatch(/\b(update|delete)\b/i);
  });

  it("widens nothing for the browser's roles", () => {
    expect(statements).not.toMatch(/to\s+(anon|authenticated)\b/);
  });
});
