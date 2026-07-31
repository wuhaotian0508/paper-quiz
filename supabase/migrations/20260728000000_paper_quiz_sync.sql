create table public.paper_quiz_sessions (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  payload jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table public.paper_quiz_mistakes (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  payload jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

alter table public.paper_quiz_sessions enable row level security;
alter table public.paper_quiz_mistakes enable row level security;

-- RLS limits rows by auth.uid(); these grants let authenticated requests reach the tables.
grant select, insert, update, delete on table public.paper_quiz_sessions to authenticated;
grant select, insert, update, delete on table public.paper_quiz_mistakes to authenticated;

create policy "Users manage their own quiz sessions" on public.paper_quiz_sessions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Users manage their own quiz mistakes" on public.paper_quiz_mistakes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
