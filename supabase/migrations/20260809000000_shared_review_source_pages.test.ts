import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260809000000_shared_review_source_pages.sql",
  "utf8",
);

/** Comments in this migration quote the statements it deliberately avoids. */
const statements = migration
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

describe("shared review projection migration", () => {
  it("projects every field the shared review page renders", () => {
    // The page reads sections first and falls back to topics; source pages feed the preview
    // strip. A field missing here is a blank area on the shared link, not an error.
    for (const field of ["sections", "topics", "sourcePages", "subject", "scope", "goal"]) {
      expect(migration).toContain(`'${field}'`);
    }
  });

  it("keeps the share bounded to the review payload", () => {
    expect(migration).toContain("security definer");
    expect(migration).toContain("review.is_active = true");
    expect(migration).toContain("review.expires_at > now()");
  });

  it("does not revoke the PUBLIC execute grant that PostgREST inherits", () => {
    // 20260804 revoked it and shared links stopped resolving in production; 20260805 restored
    // it. Re-asserting the projection must not walk that back.
    expect(statements).not.toContain("revoke");
    expect(statements).toContain(
      "grant execute on function public.get_shared_review_sheet(text) to public;",
    );
  });
});
