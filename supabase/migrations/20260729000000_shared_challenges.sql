create table public.paper_quiz_shared_challenges (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  slug text not null unique check (slug ~ '^[a-z0-9]{8,64}$'),
  title text not null check (char_length(title) between 1 and 200),
  summary text not null check (char_length(summary) <= 2000),
  public_quiz jsonb not null,
  is_active boolean not null default true,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.paper_quiz_shared_challenge_keys (
  challenge_id uuid primary key references public.paper_quiz_shared_challenges(id) on delete cascade,
  answer_key jsonb not null
);

create table public.paper_quiz_shared_challenge_attempts (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.paper_quiz_shared_challenges(id) on delete cascade,
  participant_id uuid references auth.users(id) on delete set null,
  display_name text not null check (char_length(display_name) between 1 and 80),
  answers jsonb not null,
  result jsonb not null,
  score numeric,
  completed_at timestamptz not null default now()
);

create index paper_quiz_shared_challenge_attempts_challenge_id_idx
  on public.paper_quiz_shared_challenge_attempts(challenge_id, completed_at desc);

alter table public.paper_quiz_shared_challenges enable row level security;
alter table public.paper_quiz_shared_challenge_keys enable row level security;
alter table public.paper_quiz_shared_challenge_attempts enable row level security;

grant select, insert, update, delete on table public.paper_quiz_shared_challenges to authenticated;
grant select, insert, update, delete on table public.paper_quiz_shared_challenge_keys to authenticated;
grant select on table public.paper_quiz_shared_challenge_attempts to authenticated;

create policy "Users manage their own shared challenges" on public.paper_quiz_shared_challenges
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

create policy "Users manage answer keys for their own challenges" on public.paper_quiz_shared_challenge_keys
  for all using (
    exists (
      select 1 from public.paper_quiz_shared_challenges challenge
      where challenge.id = challenge_id and challenge.owner_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.paper_quiz_shared_challenges challenge
      where challenge.id = challenge_id and challenge.owner_id = auth.uid()
    )
  );

create policy "Owners read attempts for their own shared challenges"
  on public.paper_quiz_shared_challenge_attempts
  for select using (
    exists (
      select 1 from public.paper_quiz_shared_challenges challenge
      where challenge.id = challenge_id and challenge.owner_id = auth.uid()
    )
  );

create or replace function public.create_shared_challenge(
  p_slug text,
  p_public_quiz jsonb,
  p_answer_key jsonb,
  p_expires_at timestamptz default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_challenge public.paper_quiz_shared_challenges;
begin
  if auth.uid() is null then
    raise exception 'Sign in before sharing a quiz.';
  end if;
  if p_slug is null or p_slug !~ '^[a-z0-9]{8,64}$' then
    raise exception 'Challenge link is invalid.';
  end if;
  if jsonb_typeof(p_public_quiz) <> 'object' or jsonb_typeof(p_answer_key) <> 'object' then
    raise exception 'Challenge data is invalid.';
  end if;
  if p_expires_at is not null and p_expires_at <= now() then
    raise exception 'Challenge expiration must be in the future.';
  end if;

  insert into public.paper_quiz_shared_challenges (
    owner_id, slug, title, summary, public_quiz, expires_at
  ) values (
    auth.uid(),
    p_slug,
    coalesce(nullif(left(p_public_quiz->>'title', 200), ''), 'Shared quiz'),
    left(coalesce(p_public_quiz->>'summary', ''), 2000),
    p_public_quiz,
    p_expires_at
  ) returning * into v_challenge;

  insert into public.paper_quiz_shared_challenge_keys (challenge_id, answer_key)
  values (v_challenge.id, p_answer_key);

  return jsonb_build_object('slug', v_challenge.slug, 'expiresAt', v_challenge.expires_at);
end;
$$;

create or replace function public.get_shared_challenge(p_slug text)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'slug', challenge.slug,
    'title', challenge.title,
    'summary', challenge.summary,
    'quiz', challenge.public_quiz,
    'expiresAt', challenge.expires_at
  )
  from public.paper_quiz_shared_challenges challenge
  where challenge.slug = p_slug
    and challenge.is_active = true
    and (challenge.expires_at is null or challenge.expires_at > now());
$$;

create or replace function public.submit_shared_challenge_attempt(
  p_slug text,
  p_answers jsonb,
  p_display_name text default ''
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_challenge public.paper_quiz_shared_challenges;
  v_answer_key jsonb;
  v_key jsonb;
  v_answer text;
  v_status text;
  v_score numeric;
  v_results jsonb := '[]'::jsonb;
  v_correct integer := 0;
  v_objective_total integer := 0;
begin
  if jsonb_typeof(p_answers) <> 'object' then
    raise exception 'Answers must be an object.';
  end if;

  select challenge.* into v_challenge
  from public.paper_quiz_shared_challenges challenge
  where challenge.slug = p_slug
    and challenge.is_active = true
    and (challenge.expires_at is null or challenge.expires_at > now());
  if not found then
    raise exception 'Challenge is unavailable.';
  end if;

  select answer_key into v_answer_key
  from public.paper_quiz_shared_challenge_keys
  where challenge_id = v_challenge.id;

  for v_key in select value from jsonb_array_elements(v_answer_key->'questions') loop
    v_answer := coalesce(p_answers->>(v_key->>'id'), '');
    if v_key->>'type' = 'multiple_choice' then
      v_objective_total := v_objective_total + 1;
      v_score := case when v_answer = v_key->>'correctOptionId' then 1 else 0 end;
      v_status := case when v_score = 1 then 'correct' else 'incorrect' end;
      v_correct := v_correct + v_score::integer;
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'id', v_key->>'id',
        'status', v_status,
        'score', v_score,
        'correctOptionId', v_key->>'correctOptionId',
        'feedback', v_key->>'explanation'
      ));
    elsif v_key->>'type' = 'fill_blank' then
      v_objective_total := v_objective_total + 1;
      v_score := case when exists (
        select 1
        from jsonb_array_elements_text(v_key->'acceptedAnswers') accepted(answer)
        where lower(regexp_replace(trim(v_answer), '[^[:alnum:]]+', ' ', 'g')) =
              lower(regexp_replace(trim(accepted.answer), '[^[:alnum:]]+', ' ', 'g'))
      ) then 1 else 0 end;
      v_status := case when v_score = 1 then 'correct' else 'incorrect' end;
      v_correct := v_correct + v_score::integer;
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'id', v_key->>'id',
        'status', v_status,
        'score', v_score,
        'referenceAnswer', v_key->>'referenceAnswer',
        'feedback', v_key->>'explanation'
      ));
    else
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'id', v_key->>'id',
        'status', 'self_review',
        'score', null,
        'referenceAnswer', v_key->>'referenceAnswer',
        'feedback', v_key->>'explanation'
      ));
    end if;
  end loop;

  insert into public.paper_quiz_shared_challenge_attempts (
    challenge_id, participant_id, display_name, answers, result, score
  ) values (
    v_challenge.id,
    auth.uid(),
    coalesce(nullif(left(trim(p_display_name), 80), ''), 'Anonymous'),
    p_answers,
    v_results,
    case when v_objective_total = 0 then null else v_correct::numeric / v_objective_total end
  );

  return jsonb_build_object(
    'score', case when v_objective_total = 0 then null else v_correct::numeric / v_objective_total end,
    'objectiveCount', v_objective_total,
    'results', v_results
  );
end;
$$;

revoke all on function public.create_shared_challenge(text, jsonb, jsonb, timestamptz) from public;
revoke all on function public.get_shared_challenge(text) from public;
revoke all on function public.submit_shared_challenge_attempt(text, jsonb, text) from public;
grant execute on function public.create_shared_challenge(text, jsonb, jsonb, timestamptz) to authenticated;
grant execute on function public.get_shared_challenge(text) to anon, authenticated;
grant execute on function public.submit_shared_challenge_attempt(text, jsonb, text) to anon, authenticated;
