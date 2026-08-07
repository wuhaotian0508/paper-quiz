-- Study library rows carry each PDF's subject, so course assignments follow the student
-- across devices. Same shape and policies as paper_quiz_sessions/paper_quiz_mistakes: one
-- row per material per user, whole record in jsonb, last write by updated_at wins.
create table public.paper_quiz_library (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  payload jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

alter table public.paper_quiz_library enable row level security;

-- RLS limits rows by auth.uid(); this grant lets authenticated requests reach the table.
grant select, insert, update, delete on table public.paper_quiz_library to authenticated;

create policy "Users manage their own study library" on public.paper_quiz_library
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
