-- Contacts and one-to-one messages. Until now two learners could only meet through an
-- anonymous share link: whoever opened it stayed a stranger, and there was nowhere to ask
-- "why is question 3 B?" without leaving the product. These two tables give the pair a
-- name and a thread that outlive a single shared quiz.

-- One row per *relationship*, not per request, so A asking B and B asking A cannot become
-- two rows that disagree with each other.
create table public.paper_quiz_contacts (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users(id) on delete cascade,
  addressee_id uuid not null references auth.users(id) on delete cascade,
  -- Declining deletes the row rather than writing a 'declined' tombstone. A tombstone would
  -- lock the other side out of ever asking again, and "I tapped the wrong button" is common.
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  check (requester_id <> addressee_id)
);

-- One relationship per pair, whichever side asked first.
create unique index paper_quiz_contacts_pair_idx on public.paper_quiz_contacts
  (least(requester_id, addressee_id), greatest(requester_id, addressee_id));

create index paper_quiz_contacts_addressee_idx
  on public.paper_quiz_contacts (addressee_id, status);
create index paper_quiz_contacts_requester_idx
  on public.paper_quiz_contacts (requester_id, status);

alter table public.paper_quiz_contacts enable row level security;

-- Read and delete only. There is deliberately no insert or update grant: creating and
-- accepting a relationship both run through the security-definer functions below, which
-- makes "nobody can put themselves in someone else's contact list" a fact of the database
-- rather than a promise the browser keeps.
grant select, delete on table public.paper_quiz_contacts to authenticated;

create policy "Both sides read their own relationship" on public.paper_quiz_contacts
  for select using (auth.uid() in (requester_id, addressee_id));

-- Declining, withdrawing and unfriending are the same operation seen from three angles.
create policy "Either side ends the relationship" on public.paper_quiz_contacts
  for delete using (auth.uid() in (requester_id, addressee_id));

create table public.paper_quiz_messages (
  id uuid primary key default gen_random_uuid(),
  -- Defaulted, so a sender cannot be left off an insert and cannot be forged either: the
  -- insert policy below compares it against auth.uid() whichever way it was supplied.
  sender_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now(),
  read_at timestamptz,
  check (sender_id <> recipient_id)
);

-- Threads are read newest-first for one pair at a time, and the pair is unordered, so the
-- index is on the pair rather than on either participant.
create index paper_quiz_messages_thread_idx on public.paper_quiz_messages
  (least(sender_id, recipient_id), greatest(sender_id, recipient_id), created_at desc);

create index paper_quiz_messages_unread_idx
  on public.paper_quiz_messages (recipient_id, sender_id) where read_at is null;

alter table public.paper_quiz_messages enable row level security;

grant select, insert on table public.paper_quiz_messages to authenticated;
-- Column-level, and only this column: a recipient may mark a message read, and may not
-- rewrite what was said to them.
grant update (read_at) on table public.paper_quiz_messages to authenticated;

create policy "Both sides read the thread" on public.paper_quiz_messages
  for select using (auth.uid() in (sender_id, recipient_id));

-- "You may only message an accepted contact" is enforced here rather than in the app, so
-- going around the UI and posting straight at PostgREST gets the same answer.
create policy "Only accepted contacts may write" on public.paper_quiz_messages
  for insert with check (
    sender_id = auth.uid()
    and exists (
      select 1
      from public.paper_quiz_contacts contact
      where contact.status = 'accepted'
        and (
          (contact.requester_id = sender_id and contact.addressee_id = recipient_id)
          or (contact.requester_id = recipient_id and contact.addressee_id = sender_id)
        )
    )
  );

create policy "A recipient marks their own messages read" on public.paper_quiz_messages
  for update using (recipient_id = auth.uid()) with check (recipient_id = auth.uid());

/*
 * Sends a contact request by email.
 *
 * Always answers 'sent', whether or not that address has an account and whether or not the
 * two are already connected. Anything more helpful would turn the form into an oracle for
 * "does this person use Paper Plane Quiz?", which is not ours to answer.
 */
create or replace function public.send_contact_request(p_email text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_target uuid;
  v_contact public.paper_quiz_contacts;
begin
  if auth.uid() is null then
    raise exception 'Sign in before adding a contact.';
  end if;
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'Enter a valid email address.';
  end if;

  select id into v_target from auth.users where lower(email) = v_email limit 1;

  -- Safe to say out loud: it tells the caller only about their own account.
  if v_target = auth.uid() then
    raise exception 'You cannot add yourself as a contact.';
  end if;

  if v_target is not null then
    select * into v_contact
    from public.paper_quiz_contacts
    where least(requester_id, addressee_id) = least(auth.uid(), v_target)
      and greatest(requester_id, addressee_id) = greatest(auth.uid(), v_target);

    if not found then
      insert into public.paper_quiz_contacts (requester_id, addressee_id)
      values (auth.uid(), v_target);
    elsif v_contact.status = 'pending' and v_contact.addressee_id = auth.uid() then
      -- They asked first and we are asking back. Two people reaching for each other at the
      -- same time is an acceptance, not a second request nobody remembers to answer.
      update public.paper_quiz_contacts
      set status = 'accepted', responded_at = now()
      where id = v_contact.id;
    end if;
  end if;

  return jsonb_build_object('status', 'sent');
end;
$$;

create or replace function public.accept_contact_request(p_contact_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated integer;
begin
  if auth.uid() is null then
    raise exception 'Sign in before answering a contact request.';
  end if;

  update public.paper_quiz_contacts
  set status = 'accepted', responded_at = now()
  where id = p_contact_id and addressee_id = auth.uid() and status = 'pending';
  get diagnostics v_updated = row_count;

  if v_updated = 0 then
    raise exception 'That contact request is no longer pending.';
  end if;

  return jsonb_build_object('status', 'accepted');
end;
$$;

/*
 * Ends a relationship from either side, and takes the conversation with it.
 *
 * The messages have to go explicitly: they reference the two users, not the contact row, so
 * dropping the relationship on its own would leave a thread both people can still read and
 * make "remove contact" a purely cosmetic act.
 */
create or replace function public.remove_contact(p_contact_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contact public.paper_quiz_contacts;
begin
  if auth.uid() is null then
    raise exception 'Sign in before removing a contact.';
  end if;

  select * into v_contact
  from public.paper_quiz_contacts
  where id = p_contact_id and auth.uid() in (requester_id, addressee_id);
  if not found then
    raise exception 'That contact no longer exists.';
  end if;

  delete from public.paper_quiz_messages
  where least(sender_id, recipient_id) = least(v_contact.requester_id, v_contact.addressee_id)
    and greatest(sender_id, recipient_id) = greatest(v_contact.requester_id, v_contact.addressee_id);

  delete from public.paper_quiz_contacts where id = v_contact.id;

  return jsonb_build_object('status', 'removed');
end;
$$;

/*
 * Everything the contacts page draws, in one round trip.
 *
 * It has to be a security-definer function because the one thing a contact list must show -
 * who the other person is - lives in auth.users, which authenticated cannot read. Only the
 * addresses of people already connected to the caller, or asking to be, are returned.
 */
create or replace function public.list_contacts()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_contacts jsonb;
  v_incoming jsonb;
  v_outgoing jsonb;
begin
  if v_me is null then
    raise exception 'Sign in to see your contacts.';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'contactId', contact.id,
        'userId', other.id,
        'email', other.email,
        'unreadCount', unread.total,
        'lastMessage', last_message.body,
        'lastMessageAt', last_message.created_at
      )
      order by last_message.created_at desc nulls last, other.email
    ),
    '[]'::jsonb
  )
  into v_contacts
  from public.paper_quiz_contacts contact
  join auth.users other
    on other.id = case
      when contact.requester_id = v_me then contact.addressee_id
      else contact.requester_id
    end
  cross join lateral (
    select count(*) as total
    from public.paper_quiz_messages message
    where message.sender_id = other.id
      and message.recipient_id = v_me
      and message.read_at is null
  ) unread
  left join lateral (
    select left(message.body, 120) as body, message.created_at
    from public.paper_quiz_messages message
    where least(message.sender_id, message.recipient_id) = least(v_me, other.id)
      and greatest(message.sender_id, message.recipient_id) = greatest(v_me, other.id)
    order by message.created_at desc
    limit 1
  ) last_message on true
  where contact.status = 'accepted'
    and v_me in (contact.requester_id, contact.addressee_id);

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'contactId', contact.id,
        'userId', requester.id,
        'email', requester.email,
        'createdAt', contact.created_at
      )
      order by contact.created_at desc
    ),
    '[]'::jsonb
  )
  into v_incoming
  from public.paper_quiz_contacts contact
  join auth.users requester on requester.id = contact.requester_id
  where contact.status = 'pending' and contact.addressee_id = v_me;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'contactId', contact.id,
        'userId', addressee.id,
        'email', addressee.email,
        'createdAt', contact.created_at
      )
      order by contact.created_at desc
    ),
    '[]'::jsonb
  )
  into v_outgoing
  from public.paper_quiz_contacts contact
  join auth.users addressee on addressee.id = contact.addressee_id
  where contact.status = 'pending' and contact.requester_id = v_me;

  -- The caller's own id rides along so the browser can tell which side of a thread it is
  -- looking at without a second round trip to the auth endpoint.
  return jsonb_build_object(
    'userId', v_me,
    'contacts', v_contacts,
    'incoming', v_incoming,
    'outgoing', v_outgoing
  );
end;
$$;

-- Every one of these speaks for the signed-in learner, so none of them is reachable by anon.
revoke all on function public.send_contact_request(text) from public;
revoke all on function public.accept_contact_request(uuid) from public;
revoke all on function public.remove_contact(uuid) from public;
revoke all on function public.list_contacts() from public;
grant execute on function public.send_contact_request(text) to authenticated;
grant execute on function public.accept_contact_request(uuid) to authenticated;
grant execute on function public.remove_contact(uuid) to authenticated;
grant execute on function public.list_contacts() to authenticated;
