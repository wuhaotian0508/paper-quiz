create table public.paper_quiz_shared_review_sheets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  slug text not null unique check (slug ~ '^review-[a-z0-9]{8,64}$'),
  title text not null check (char_length(title) between 1 and 200),
  review jsonb not null,
  is_active boolean not null default true,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.paper_quiz_shared_review_sheets enable row level security;
grant select, insert, update, delete on table public.paper_quiz_shared_review_sheets to authenticated;

create policy "Users manage their own shared review sheets" on public.paper_quiz_shared_review_sheets
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

create or replace function public.create_shared_review_sheet(
  p_slug text,
  p_review jsonb,
  p_expires_at timestamptz default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_review public.paper_quiz_shared_review_sheets;
begin
  if auth.uid() is null then raise exception 'Sign in before sharing a review.'; end if;
  if p_slug is null or p_slug !~ '^review-[a-z0-9]{8,64}$' then raise exception 'Review link is invalid.'; end if;
  if jsonb_typeof(p_review) <> 'object' then raise exception 'Review data is invalid.'; end if;
  if p_expires_at is not null and p_expires_at <= now() then raise exception 'Review expiration must be in the future.'; end if;
  insert into public.paper_quiz_shared_review_sheets (owner_id, slug, title, review, expires_at)
  values (auth.uid(), p_slug, coalesce(nullif(left(p_review->>'title', 200), ''), 'Shared review'), p_review, p_expires_at)
  returning * into v_review;
  return jsonb_build_object('slug', v_review.slug, 'expiresAt', v_review.expires_at);
end;
$$;

create or replace function public.get_shared_review_sheet(p_slug text)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'slug', review.slug,
    'title', review.title,
    'topics', review.review->'topics',
    'expiresAt', review.expires_at
  )
  from public.paper_quiz_shared_review_sheets review
  where review.slug = p_slug
    and review.is_active = true
    and (review.expires_at is null or review.expires_at > now());
$$;

revoke all on function public.create_shared_review_sheet(text, jsonb, timestamptz) from public;
revoke all on function public.get_shared_review_sheet(text) from public;
grant execute on function public.create_shared_review_sheet(text, jsonb, timestamptz) to authenticated;
grant execute on function public.get_shared_review_sheet(text) to anon, authenticated;
