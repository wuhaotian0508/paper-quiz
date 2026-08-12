import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20260814000000_nearby_learners.sql", "utf8");

/**
 * The file with its `--` comments stripped. Prose about grants is not a grant, and matching
 * across it is how "there is no grant here" first came back green on a sentence.
 */
const statements = migration.replace(/--[^\n]*/g, "");

describe("nearby learners migration", () => {
  it("puts a coordinate somewhere no browser session can reach it", () => {
    expect(migration).toContain("create table public.paper_quiz_locations");
    expect(migration).toContain(
      "alter table public.paper_quiz_locations enable row level security",
    );
    // Not "select your own row" — no grant of any kind, and no policy to widen later by accident.
    expect(statements).not.toMatch(/\bgrant\b[^;]*paper_quiz_locations/);
    expect(statements).not.toMatch(/create policy[^;]*paper_quiz_locations/);
  });

  /**
   * Writing no grant is not the same as having none. Supabase's default privileges give every
   * new table in this schema REFERENCES, TRIGGER and TRUNCATE, and this migration was applied
   * once without the revoke — the table came out with six privileges the file never mentions.
   * Asserting the file's silence is what missed it, so assert the revoke instead.
   */
  it("takes back the privileges the schema hands out on its own", () => {
    expect(migration).toContain(
      "revoke all on public.paper_quiz_locations from anon, authenticated;",
    );
    expect(migration).toContain(
      "revoke trigger, references, truncate on all tables in schema public from anon, authenticated;",
    );
  });

  it("blunts the coordinate before it is stored, not when it is shown", () => {
    expect(migration).toContain("round(p_latitude::numeric, 3)");
    expect(migration).toContain("round(p_longitude::numeric, 3)");
  });

  it("lets sharing lapse on its own", () => {
    expect(migration).toContain("expires_at timestamptz not null");
    expect(migration).toContain("now() + interval '4 hours'");
    expect(migration).toContain("expires_at > now()");
    expect(migration).toContain(
      "delete from public.paper_quiz_locations where user_id = auth.uid()",
    );
  });

  it("answers in bands and never in metres", () => {
    expect(migration).toContain("'here'");
    expect(migration).toContain("'nearby'");
    expect(migration).toContain("'city'");
    // The payload names neither a coordinate nor a distance.
    const payload = migration.slice(
      migration.indexOf("create or replace function public.find_nearby_learners"),
    );
    expect(payload).not.toMatch(/'latitude'|'longitude'|'metres'|'email'/);
    // Ordering by true distance would give back the ordering the bands exist to withhold.
    expect(migration).toContain("order by found.band_rank, found.name");
  });

  it("hands out a display name rather than an address", () => {
    expect(migration).toContain("split_part(account.email, '@', 1)");
  });

  it("makes discovery mutual", () => {
    expect(migration).toContain(
      "return jsonb_build_object('sharing', false, 'expiresAt', null, 'nearby', '[]'::jsonb);",
    );
  });

  it("keeps one copy of the pairing rule behind both ways of adding someone", () => {
    expect(migration).toContain(
      "create or replace function public.request_contact(p_user_id uuid)",
    );
    expect(migration).toContain(
      "create or replace function public.send_contact_request(p_email text)",
    );
    expect(migration).toContain("return public.request_contact(v_target);");
    // The email wrapper must not carry its own copy of the insert/auto-accept logic.
    const wrapper = migration.slice(
      migration.indexOf("create or replace function public.send_contact_request"),
    );
    expect(wrapper).not.toContain("insert into public.paper_quiz_contacts");
  });

  it("still refuses to say whether an address has an account", () => {
    expect(migration).toContain("jsonb_build_object('status', 'sent')");
    expect(migration).toContain("if v_target is null then");
  });

  it("is reachable by a signed-in learner and by nobody else", () => {
    for (const signature of [
      "public.share_location(double precision, double precision)",
      "public.stop_sharing_location()",
      "public.find_nearby_learners()",
      "public.request_contact(uuid)",
    ]) {
      expect(migration).toContain(`revoke all on function ${signature} from public;`);
      expect(migration).toContain(`grant execute on function ${signature} to authenticated;`);
    }
    expect(migration).not.toMatch(/grant execute on function[^;]*to[^;]*anon/);
    expect(migration.match(/security definer/g)).toHaveLength(5);
  });
});
