import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20260813000000_contacts.sql", "utf8");

describe("contacts migration", () => {
  it("keeps one relationship per pair, in whichever direction it was asked", () => {
    expect(migration).toContain("create table public.paper_quiz_contacts");
    expect(migration).toContain("create unique index paper_quiz_contacts_pair_idx");
    expect(migration).toContain(
      "(least(requester_id, addressee_id), greatest(requester_id, addressee_id))",
    );
    expect(migration).toContain("check (requester_id <> addressee_id)");
  });

  it("refuses a status the app does not know how to draw", () => {
    expect(migration).toContain("status text not null default 'pending'");
    expect(migration).toContain("check (status in ('pending', 'accepted'))");
  });

  it("lets nobody write themselves into another learner's contact list", () => {
    expect(migration).toContain(
      "grant select, delete on table public.paper_quiz_contacts to authenticated;",
    );
    expect(migration).not.toMatch(/grant [^;]*(insert|update)[^;]*paper_quiz_contacts/);
    expect(migration).toContain(
      'create policy "Both sides read their own relationship" on public.paper_quiz_contacts',
    );
    expect(migration).toContain('create policy "Either side ends the relationship"');
  });

  it("stops a message reaching anyone who is not an accepted contact", () => {
    expect(migration).toContain('create policy "Only accepted contacts may write"');
    expect(migration).toContain("sender_id = auth.uid()");
    expect(migration).toContain("where contact.status = 'accepted'");
  });

  it("lets a recipient mark a message read and not rewrite it", () => {
    expect(migration).toContain(
      "grant update (read_at) on table public.paper_quiz_messages to authenticated;",
    );
    expect(migration).not.toMatch(/grant update on table public\.paper_quiz_messages/);
    expect(migration).toContain('create policy "A recipient marks their own messages read"');
    expect(migration).toContain("for update using (recipient_id = auth.uid())");
  });

  it("keeps messages inside the pair and out of everyone else's reach", () => {
    expect(migration).toContain("body text not null check (char_length(body) between 1 and 2000)");
    expect(migration).toContain("sender_id uuid not null default auth.uid()");
    expect(migration).toContain('create policy "Both sides read the thread"');
    expect(migration).toContain("using (auth.uid() in (sender_id, recipient_id))");
    expect(migration).not.toMatch(/grant [^;]*delete[^;]*paper_quiz_messages/);
  });

  it("says the same thing whether or not the address has an account", () => {
    expect(migration).toContain(
      "create or replace function public.send_contact_request(p_email text)",
    );
    expect(migration).toContain("jsonb_build_object('status', 'sent')");
    // One exit, taken whether the lookup found somebody or not.
    expect(migration.match(/'status', 'sent'/g)).toHaveLength(1);
  });

  it("takes the conversation away with the contact", () => {
    expect(migration).toContain(
      "create or replace function public.remove_contact(p_contact_id uuid)",
    );
    expect(migration).toContain("delete from public.paper_quiz_messages");
    expect(migration).toContain("delete from public.paper_quiz_contacts where id = v_contact.id;");
  });

  it("reads other learners' addresses through a definer function and nothing else", () => {
    for (const signature of [
      "public.send_contact_request(text)",
      "public.accept_contact_request(uuid)",
      "public.remove_contact(uuid)",
      "public.list_contacts()",
    ]) {
      expect(migration).toContain(`revoke all on function ${signature} from public;`);
      expect(migration).toContain(`grant execute on function ${signature} to authenticated;`);
    }
    expect(migration).not.toMatch(
      /grant execute on function public\.(send_contact_request|accept_contact_request|remove_contact|list_contacts)[^;]*anon/,
    );
    expect(migration.match(/security definer/g)).toHaveLength(4);
  });
});
