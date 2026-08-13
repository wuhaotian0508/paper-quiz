-- Course groups. A direct message needs both people to have agreed first, which is right for
-- two strangers and wrong for a class: the twenty people in UGBA 117 already share something,
-- and making them pair off one by one to talk about it is the long way round.
--
-- These rooms are open. Anyone signed in can see the list, start a course and walk into one -
-- there is no invitation to wait on, because a course is not a secret and the point is to find
-- the people already in it.

create table public.paper_quiz_groups (
  id uuid primary key default gen_random_uuid(),
  -- The course. Same free text as the library's folders, so "UGBA 117" means the same thing in
  -- both places without a join between them.
  name text not null check (char_length(trim(name)) between 1 and 80),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- One room per course, whatever case it was typed in. Without this, "UGBA 117" and "ugba 117"
-- become two rooms and split the class in half - which is the one outcome this feature exists
-- to prevent.
create unique index paper_quiz_groups_name_idx on public.paper_quiz_groups (lower(trim(name)));

create table public.paper_quiz_group_members (
  group_id uuid not null references public.paper_quiz_groups(id) on delete cascade,
  -- Defaulted, so joining is "insert a row about yourself" and the policy below has only one
  -- thing left to check.
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create index paper_quiz_group_members_user_idx on public.paper_quiz_group_members (user_id);

create table public.paper_quiz_group_messages (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.paper_quiz_groups(id) on delete cascade,
  sender_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index paper_quiz_group_messages_group_idx
  on public.paper_quiz_group_messages (group_id, created_at desc);

-- Reports of what someone said in a room. Insert-only, like the question reports: an inbox for
-- us, never a list anyone in the product can read back. An open room can be walked into by
-- anybody, so this is the one thing standing between the room and whoever wants to spoil it.
create table public.paper_quiz_group_message_reports (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.paper_quiz_group_messages(id) on delete cascade,
  reporter_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  note text check (note is null or char_length(note) <= 500),
  created_at timestamptz not null default now(),
  unique (message_id, reporter_id)
);

/*
 * Is the caller in this room?
 *
 * Security definer out of necessity, not preference: a policy on paper_quiz_group_members that
 * asks paper_quiz_group_members who the members are re-enters the same policy, and Postgres
 * stops it as infinite recursion.
 */
create or replace function public.joined_group(p_group_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.paper_quiz_group_members member
    where member.group_id = p_group_id and member.user_id = auth.uid()
  );
$$;

alter table public.paper_quiz_groups enable row level security;
alter table public.paper_quiz_group_members enable row level security;
alter table public.paper_quiz_group_messages enable row level security;
alter table public.paper_quiz_group_message_reports enable row level security;

grant select on table public.paper_quiz_groups to authenticated;
-- Insert and delete, but no update: joining and leaving are the only two things a learner does
-- to a membership, and neither is an edit.
grant select, insert, delete on table public.paper_quiz_group_members to authenticated;
grant select, insert on table public.paper_quiz_group_messages to authenticated;
grant insert on table public.paper_quiz_group_message_reports to authenticated;

-- The list of courses is the directory people join from, so it is readable by anyone signed in.
-- A name and a headcount is all it carries; what was said inside needs membership.
create policy "Signed-in learners can see what courses exist" on public.paper_quiz_groups
  for select using (auth.uid() is not null);

-- Creating goes through create_group, which also puts the creator in the room and folds a
-- duplicate name into the room that already exists.
create policy "Members read the roster" on public.paper_quiz_group_members
  for select using (user_id = auth.uid() or public.joined_group(group_id));

-- Joining is open, and it is the one row you may write: your own.
create policy "A learner joins for themselves only" on public.paper_quiz_group_members
  for insert with check (user_id = auth.uid());

create policy "A learner leaves for themselves only" on public.paper_quiz_group_members
  for delete using (user_id = auth.uid());

create policy "Members read the room" on public.paper_quiz_group_messages
  for select using (public.joined_group(group_id));

create policy "Members write to the room" on public.paper_quiz_group_messages
  for insert with check (sender_id = auth.uid() and public.joined_group(group_id));

create policy "Anyone in the room may report what was said"
  on public.paper_quiz_group_message_reports
  for insert with check (
    reporter_id = auth.uid()
    and exists (
      select 1 from public.paper_quiz_group_messages message
      where message.id = message_id and public.joined_group(message.group_id)
    )
  );

/*
 * Starts a course, or walks into it if somebody already did.
 *
 * Returning the existing room rather than an error is the whole point of the unique index: a
 * learner typing "UGBA 117" wants to be with the UGBA 117 people, and whether they are the
 * first to type it is not something they should have to know.
 */
create or replace function public.create_group(p_name text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := trim(coalesce(p_name, ''));
  v_group public.paper_quiz_groups;
begin
  if auth.uid() is null then
    raise exception 'Sign in before starting a group.';
  end if;
  if char_length(v_name) < 1 or char_length(v_name) > 80 then
    raise exception 'Give the group a course name.';
  end if;

  select * into v_group from public.paper_quiz_groups
  where lower(trim(name)) = lower(v_name);

  if not found then
    insert into public.paper_quiz_groups (name, created_by)
    values (v_name, auth.uid())
    returning * into v_group;
  end if;

  insert into public.paper_quiz_group_members (group_id, user_id)
  values (v_group.id, auth.uid())
  on conflict (group_id, user_id) do nothing;

  return jsonb_build_object('groupId', v_group.id, 'name', v_group.name);
end;
$$;

/*
 * Leaves, and takes the room with you if you were the last one in it.
 *
 * An empty room is not a room. Leaving it behind would leave its messages held by a policy
 * with no members left to answer for, and a course name nobody can reach again.
 */
create or replace function public.leave_group(p_group_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_remaining integer;
begin
  if auth.uid() is null then
    raise exception 'Sign in before leaving a group.';
  end if;

  delete from public.paper_quiz_group_members
  where group_id = p_group_id and user_id = auth.uid();

  select count(*) into v_remaining
  from public.paper_quiz_group_members
  where group_id = p_group_id;

  if v_remaining = 0 then
    delete from public.paper_quiz_groups where id = p_group_id;
    return jsonb_build_object('status', 'left', 'groupRemoved', true);
  end if;

  return jsonb_build_object('status', 'left', 'groupRemoved', false);
end;
$$;

/*
 * Every course, with the ones this learner has joined marked as such.
 *
 * A preview of the last thing said only travels for a room the caller is in. A headcount and a
 * name travel for all of them, because that is what a directory is for.
 */
create or replace function public.list_groups()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_groups jsonb;
begin
  if v_me is null then
    raise exception 'Sign in to see your groups.';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'groupId', grp.id,
        'name', grp.name,
        'memberCount', headcount.total,
        'joined', mine.user_id is not null,
        'lastMessage', case when mine.user_id is null then null else last_message.body end,
        'lastMessageAt', case when mine.user_id is null then null else last_message.created_at end
      )
      order by (mine.user_id is null), last_message.created_at desc nulls last, grp.name
    ),
    '[]'::jsonb
  )
  into v_groups
  from public.paper_quiz_groups grp
  left join public.paper_quiz_group_members mine
    on mine.group_id = grp.id and mine.user_id = v_me
  cross join lateral (
    select count(*) as total
    from public.paper_quiz_group_members roster
    where roster.group_id = grp.id
  ) headcount
  left join lateral (
    select left(message.body, 120) as body, message.created_at
    from public.paper_quiz_group_messages message
    where message.group_id = grp.id
    order by message.created_at desc
    limit 1
  ) last_message on true;

  return jsonb_build_object('userId', v_me, 'groups', v_groups);
end;
$$;

/** The room's messages with a name against each, for a caller who is in it. */
create or replace function public.read_group(p_group_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_messages jsonb;
  v_members jsonb;
begin
  if auth.uid() is null then
    raise exception 'Sign in to read a group.';
  end if;
  if not public.joined_group(p_group_id) then
    raise exception 'Join the group to read it.';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', message.id,
        'senderId', message.sender_id,
        -- The local part only, as everywhere else: a room is not a place to collect addresses.
        'name', split_part(account.email, '@', 1),
        'body', message.body,
        'createdAt', message.created_at
      )
      order by message.created_at
    ),
    '[]'::jsonb
  )
  into v_messages
  from (
    select * from public.paper_quiz_group_messages
    where group_id = p_group_id
    order by created_at desc
    limit 200
  ) message
  join auth.users account on account.id = message.sender_id;

  select coalesce(jsonb_agg(split_part(account.email, '@', 1) order by account.email), '[]'::jsonb)
  into v_members
  from public.paper_quiz_group_members roster
  join auth.users account on account.id = roster.user_id
  where roster.group_id = p_group_id;

  return jsonb_build_object('messages', v_messages, 'members', v_members);
end;
$$;

revoke all on function public.joined_group(uuid) from public;
revoke all on function public.create_group(text) from public;
revoke all on function public.leave_group(uuid) from public;
revoke all on function public.list_groups() from public;
revoke all on function public.read_group(uuid) from public;
grant execute on function public.joined_group(uuid) to authenticated;
grant execute on function public.create_group(text) to authenticated;
grant execute on function public.leave_group(uuid) to authenticated;
grant execute on function public.list_groups() to authenticated;
grant execute on function public.read_group(uuid) to authenticated;

-- The schema's default privileges hand every new table REFERENCES, TRIGGER and TRUNCATE to
-- anon and authenticated. Taken back for the four created here, as for every table before them.
revoke trigger, references, truncate on all tables in schema public from anon, authenticated;
