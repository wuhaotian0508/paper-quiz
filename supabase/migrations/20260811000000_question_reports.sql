-- Reports of questions the model got wrong. Written by learners, read only by us.
create table public.paper_quiz_question_reports (
  id uuid primary key default gen_random_uuid(),
  -- Null when nobody was signed in: most practice happens signed out, and a report from an
  -- anonymous learner is worth exactly as much as one from an account.
  reporter_id uuid references auth.users(id) on delete set null,
  reason text not null check (reason in ('wrong_answer', 'bad_options', 'not_in_source', 'unclear', 'other')),
  note text check (note is null or char_length(note) <= 500),
  question_key text not null check (char_length(question_key) between 1 and 100),
  question jsonb not null,
  locale text not null default 'en' check (locale in ('en', 'zh')),
  created_at timestamptz not null default now()
);

create index paper_quiz_question_reports_key_idx
  on public.paper_quiz_question_reports (question_key, created_at desc);

alter table public.paper_quiz_question_reports enable row level security;

-- Insert only, for both roles. There is deliberately no select policy: a report is an inbox
-- for us, not a public list, and nothing in the product reads one back.
grant insert on table public.paper_quiz_question_reports to anon, authenticated;

create policy "Anyone may report a question" on public.paper_quiz_question_reports
  for insert with check (reporter_id is null or reporter_id = auth.uid());
