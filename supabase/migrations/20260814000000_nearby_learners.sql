-- Finding a classmate who is actually in the room. Until now the only way to reach someone
-- was to already know their email, which is no help at all when the person who could explain
-- question 3 is two tables away in the library and neither of you knows the other exists.
--
-- The whole design turns on one rule: a coordinate goes in and never comes out. What leaves
-- this file is a distance band - "here", "nearby", "city" - and nothing finer.

create table public.paper_quiz_locations (
  user_id uuid primary key references auth.users(id) on delete cascade,
  -- Snapped to three decimals (~110 m) by share_location before it lands here, so even a
  -- copy of this table does not say which building somebody was in.
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  updated_at timestamptz not null default now(),
  -- Sharing lapses on its own. Forgetting to turn it off is the failure mode worth designing
  -- against, and an expiry is the only thing that fixes it without the learner doing anything.
  expires_at timestamptz not null
);

create index paper_quiz_locations_expires_idx on public.paper_quiz_locations (expires_at);

alter table public.paper_quiz_locations enable row level security;

-- Deliberately no policies. Not "select your own row" - nothing at all. Every read and write
-- goes through the security-definer functions below, so there is no request a browser session
-- can make, to PostgREST or anywhere else, that returns a latitude. RLS is on as a second
-- lock rather than as the lock.
--
-- The revoke is not belt-and-braces. Supabase's default privileges on this schema hand every
-- newly created table REFERENCES, TRIGGER and TRUNCATE to anon and authenticated, so writing
-- no grant is not the same as having none - this table came out of `create table` with six
-- privileges nobody asked for. TRUNCATE ignores RLS, and TRIGGER on a table of coordinates
-- lets anyone with a direct connection read rows straight out of NEW.
revoke all on public.paper_quiz_locations from anon, authenticated;

-- Every table these migrations have created was handed the same three. None is used by
-- anything, so they go back across the schema rather than one table at a time.
revoke trigger, references, truncate on all tables in schema public from anon, authenticated;

/*
 * Starts or refreshes sharing, for four hours.
 *
 * Coordinates are rounded before insert rather than before display: rounding at the edge
 * would still leave the precise value sitting in the table.
 */
create or replace function public.share_location(
  p_latitude double precision,
  p_longitude double precision
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_expires timestamptz := now() + interval '4 hours';
begin
  if auth.uid() is null then
    raise exception 'Sign in before sharing where you are.';
  end if;
  if p_latitude is null or p_longitude is null
    or p_latitude < -90 or p_latitude > 90
    or p_longitude < -180 or p_longitude > 180 then
    raise exception 'That location is not on the map.';
  end if;

  insert into public.paper_quiz_locations (user_id, latitude, longitude, updated_at, expires_at)
  values (
    auth.uid(),
    round(p_latitude::numeric, 3)::double precision,
    round(p_longitude::numeric, 3)::double precision,
    now(),
    v_expires
  )
  on conflict (user_id) do update
    set latitude = excluded.latitude,
        longitude = excluded.longitude,
        updated_at = excluded.updated_at,
        expires_at = excluded.expires_at;

  return jsonb_build_object('sharing', true, 'expiresAt', v_expires);
end;
$$;

create or replace function public.stop_sharing_location()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in before changing what you share.';
  end if;

  -- Deleted, not flagged. A row that lingers is a coordinate that lingers.
  delete from public.paper_quiz_locations where user_id = auth.uid();

  return jsonb_build_object('sharing', false, 'expiresAt', null);
end;
$$;

/*
 * Who else is around, as bands rather than distances.
 *
 * Discovery is mutual: a caller who is not sharing gets an empty list. Otherwise one person
 * could stand outside the room and watch everyone in it, which is not the trade the people
 * inside agreed to.
 *
 * Results are ordered by band and then by name, never by true distance - sorting by metres
 * would hand back the ordering that the banding exists to withhold.
 */
create or replace function public.find_nearby_learners()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_mine public.paper_quiz_locations;
  v_nearby jsonb;
begin
  if v_me is null then
    raise exception 'Sign in to see who is nearby.';
  end if;

  select * into v_mine
  from public.paper_quiz_locations
  where user_id = v_me and expires_at > now();

  if not found then
    return jsonb_build_object('sharing', false, 'expiresAt', null, 'nearby', '[]'::jsonb);
  end if;

  select coalesce(jsonb_agg(found.entry order by found.band_rank, found.name), '[]'::jsonb)
  into v_nearby
  from (
    select
      jsonb_build_object(
        'userId', other.user_id,
        -- The local part only. A nearby stranger learning your full address is a different
        -- and worse thing than learning that somebody called "ada" is in the building.
        'name', split_part(account.email, '@', 1),
        'distance', case
          when distance.metres < 500 then 'here'
          when distance.metres < 2000 then 'nearby'
          else 'city'
        end,
        'relation', case
          when contact.status = 'accepted' then 'contact'
          when contact.status = 'pending' then 'pending'
          else 'none'
        end
      ) as entry,
      case
        when distance.metres < 500 then 1
        when distance.metres < 2000 then 2
        else 3
      end as band_rank,
      split_part(account.email, '@', 1) as name
    from public.paper_quiz_locations other
    join auth.users account on account.id = other.user_id
    -- Haversine on the built-in trig functions. At this size a sequential scan costs nothing,
    -- and it saves depending on PostGIS or earthdistance being installed.
    cross join lateral (
      select 6371000 * acos(least(1, greatest(-1,
        sin(radians(v_mine.latitude)) * sin(radians(other.latitude))
        + cos(radians(v_mine.latitude)) * cos(radians(other.latitude))
          * cos(radians(other.longitude - v_mine.longitude))
      ))) as metres
    ) distance
    left join public.paper_quiz_contacts contact
      on least(contact.requester_id, contact.addressee_id) = least(v_me, other.user_id)
      and greatest(contact.requester_id, contact.addressee_id) = greatest(v_me, other.user_id)
    where other.user_id <> v_me
      and other.expires_at > now()
      and distance.metres < 25000
  ) found;

  return jsonb_build_object(
    'sharing', true,
    'expiresAt', v_mine.expires_at,
    'nearby', v_nearby
  );
end;
$$;

/*
 * Asks to be someone's contact, by user id.
 *
 * This is the pairing rule that send_contact_request used to hold on its own, lifted out so
 * that adding by email and adding from the nearby list cannot drift apart. Adding from a
 * proximity list must not need an address, so id is the primitive and email is the wrapper.
 */
create or replace function public.request_contact(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contact public.paper_quiz_contacts;
begin
  if auth.uid() is null then
    raise exception 'Sign in before adding a contact.';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'You cannot add yourself as a contact.';
  end if;
  -- Silent about a stranger's existence, exactly as the email form is.
  if p_user_id is null or not exists (select 1 from auth.users where id = p_user_id) then
    return jsonb_build_object('status', 'sent');
  end if;

  select * into v_contact
  from public.paper_quiz_contacts
  where least(requester_id, addressee_id) = least(auth.uid(), p_user_id)
    and greatest(requester_id, addressee_id) = greatest(auth.uid(), p_user_id);

  if not found then
    insert into public.paper_quiz_contacts (requester_id, addressee_id)
    values (auth.uid(), p_user_id);
  elsif v_contact.status = 'pending' and v_contact.addressee_id = auth.uid() then
    -- They asked first and we are asking back: that is an acceptance.
    update public.paper_quiz_contacts
    set status = 'accepted', responded_at = now()
    where id = v_contact.id;
  end if;

  return jsonb_build_object('status', 'sent');
end;
$$;

-- Same signature, same answers, same refusal to say whether an address has an account. The
-- body is now just "resolve, then delegate", so there is one copy of the pairing rule.
create or replace function public.send_contact_request(p_email text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_target uuid;
begin
  if auth.uid() is null then
    raise exception 'Sign in before adding a contact.';
  end if;
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'Enter a valid email address.';
  end if;

  select id into v_target from auth.users where lower(email) = v_email limit 1;
  if v_target is null then
    return jsonb_build_object('status', 'sent');
  end if;

  return public.request_contact(v_target);
end;
$$;

revoke all on function public.share_location(double precision, double precision) from public;
revoke all on function public.stop_sharing_location() from public;
revoke all on function public.find_nearby_learners() from public;
revoke all on function public.request_contact(uuid) from public;
grant execute on function public.share_location(double precision, double precision) to authenticated;
grant execute on function public.stop_sharing_location() to authenticated;
grant execute on function public.find_nearby_learners() to authenticated;
grant execute on function public.request_contact(uuid) to authenticated;
