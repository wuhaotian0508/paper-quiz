-- Username + password sign-in. Supabase Auth only knows email addresses, so a profile
-- table maps a username onto the account and login resolves one to the other.

-- crypt() verifies the password inside paper_quiz_email_for_login below.
create extension if not exists pgcrypto with schema extensions;

-- Usernames are stored already lowercased and the CHECK enforces it, so a plain unique
-- index on text is case-insensitive in practice without depending on citext.
create table public.paper_quiz_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9_]{3,32}$'),
  created_at timestamptz not null default now()
);

alter table public.paper_quiz_profiles enable row level security;
grant select on table public.paper_quiz_profiles to authenticated;

create policy "Users read their own profile" on public.paper_quiz_profiles
  for select using (auth.uid() = user_id);

-- Written by trigger rather than by the client: when email confirmation is enabled
-- there is no session immediately after sign-up, so the browser cannot insert this row.
create or replace function public.paper_quiz_handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.raw_user_meta_data ? 'username' then
    insert into public.paper_quiz_profiles (user_id, username)
    values (new.id, lower(trim(new.raw_user_meta_data->>'username')));
  end if;
  return new;
end;
$$;

create trigger paper_quiz_on_auth_user_created
  after insert on auth.users
  for each row execute function public.paper_quiz_handle_new_user();

create or replace function public.paper_quiz_username_available(p_username text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select not exists (
    select 1 from public.paper_quiz_profiles
    where username = lower(trim(p_username))
  );
$$;

-- Verifies the password before returning anything, so the mapping cannot be used to
-- harvest the email addresses behind known usernames.
create or replace function public.paper_quiz_email_for_login(p_username text, p_password text)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_email text;
begin
  select users.email into v_email
  from public.paper_quiz_profiles profiles
  join auth.users users on users.id = profiles.user_id
  where profiles.username = lower(trim(p_username))
    and users.encrypted_password = extensions.crypt(p_password, users.encrypted_password);
  return v_email;
end;
$$;

revoke all on function public.paper_quiz_username_available(text) from public;
revoke all on function public.paper_quiz_email_for_login(text, text) from public;
grant execute on function public.paper_quiz_username_available(text) to anon, authenticated;
grant execute on function public.paper_quiz_email_for_login(text, text) to anon, authenticated;
