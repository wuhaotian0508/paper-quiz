-- What re-reading the study material said about a reported question.
--
-- Additive to 20260811000000: a report was worth storing before anything checked it, and
-- still is when the check cannot run (no source material, no API key, an unusable answer).
-- Every column is nullable for exactly that reason — an unchecked report is a normal row,
-- not an incomplete one.
alter table public.paper_quiz_question_reports
  add column if not exists verdict text
    check (verdict is null or verdict in ('confirmed', 'stands', 'unclear')),
  add column if not exists severity text
    check (severity is null or severity in ('critical', 'minor')),
  -- The closed rule vocabulary from lib/question-verdict.ts. Constrained here as well as in
  -- the application because this column is the shortlist a global rule gets promoted from,
  -- and a value outside the vocabulary could not be rendered into an instruction anyway.
  add column if not exists learning_rule text
    check (learning_rule is null or learning_rule in
      ('verify_answer_key', 'stay_in_source', 'single_correct_option', 'unambiguous_wording')),
  add column if not exists learning_scope text
    check (learning_scope is null or char_length(learning_scope) <= 100);

-- Triage looks for one thing: the confirmed critical faults, newest first. Partial, because
-- they are a small minority of rows and the rest are never queried this way.
create index if not exists paper_quiz_question_reports_confirmed_idx
  on public.paper_quiz_question_reports (created_at desc)
  where verdict = 'confirmed' and severity = 'critical';
