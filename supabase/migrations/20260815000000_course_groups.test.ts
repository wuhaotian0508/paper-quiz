import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20260815000000_course_groups.sql", "utf8");
/** Prose about grants is not a grant; see the nearby-learners migration test. */
const statements = migration.replace(/--[^\n]*/g, "");

describe("course groups migration", () => {
  it("keeps one room per course whatever case it was typed in", () => {
    expect(migration).toContain("create unique index paper_quiz_groups_name_idx");
    expect(migration).toContain("(lower(trim(name)))");
    // Typing a name that exists joins that room instead of failing.
    expect(migration).toContain("where lower(trim(name)) = lower(v_name);");
    expect(migration).toContain("if not found then");
  });

  it("lets anyone signed in see what courses exist", () => {
    expect(migration).toContain('create policy "Signed-in learners can see what courses exist"');
    expect(migration).toContain("for select using (auth.uid() is not null)");
  });

  it("lets a learner join and leave, and write no membership but their own", () => {
    expect(statements).toContain(
      "grant select, insert, delete on table public.paper_quiz_group_members to authenticated;",
    );
    expect(statements).not.toMatch(/grant[^;]*update[^;]*paper_quiz_group_members/);
    expect(migration).toContain('create policy "A learner joins for themselves only"');
    expect(migration).toContain("for insert with check (user_id = auth.uid())");
    expect(migration).toContain('create policy "A learner leaves for themselves only"');
    expect(migration).toContain("for delete using (user_id = auth.uid())");
  });

  /**
   * A policy on the members table that asks the members table who the members are re-enters
   * itself, and Postgres refuses it as infinite recursion. The definer helper is the reason
   * the message policies below can be written at all.
   */
  it("answers membership from outside the policy it is used in", () => {
    expect(migration).toMatch(
      /create or replace function public\.joined_group\(p_group_id uuid\)[\s\S]*?security definer/,
    );
  });

  it("needs membership to read or write what was said", () => {
    expect(migration).toContain("for select using (public.joined_group(group_id))");
    expect(migration).toContain(
      "for insert with check (sender_id = auth.uid() and public.joined_group(group_id))",
    );
    expect(migration).toContain("raise exception 'Join the group to read it.'");
  });

  it("keeps what was said out of the directory", () => {
    // A preview only travels for a room the caller is in.
    expect(migration).toContain(
      "case when mine.user_id is null then null else last_message.body end",
    );
  });

  it("takes the room away with the last person in it", () => {
    expect(migration).toContain("create or replace function public.leave_group");
    expect(migration).toContain("if v_remaining = 0 then");
    expect(migration).toContain("delete from public.paper_quiz_groups where id = p_group_id;");
  });

  it("keeps a report an inbox rather than a list", () => {
    expect(statements).toContain(
      "grant insert on table public.paper_quiz_group_message_reports to authenticated;",
    );
    expect(statements).not.toMatch(/grant[^;]*select[^;]*paper_quiz_group_message_reports/);
    expect(migration).toContain("unique (message_id, reporter_id)");
  });

  it("hands out a display name rather than an address", () => {
    expect(migration).toContain("split_part(account.email, '@', 1)");
    const readGroup = migration.slice(migration.indexOf("function public.read_group"));
    expect(readGroup).not.toMatch(/'email'/);
  });

  it("is reachable by a signed-in learner and by nobody else", () => {
    for (const signature of [
      "public.create_group(text)",
      "public.leave_group(uuid)",
      "public.list_groups()",
      "public.read_group(uuid)",
    ]) {
      expect(migration).toContain(`revoke all on function ${signature} from public;`);
      expect(migration).toContain(`grant execute on function ${signature} to authenticated;`);
    }
    expect(migration).not.toMatch(/grant execute on function[^;]*to[^;]*anon/);
  });

  it("takes back the privileges the schema hands out on its own", () => {
    expect(migration).toContain(
      "revoke trigger, references, truncate on all tables in schema public from anon, authenticated;",
    );
  });
});
