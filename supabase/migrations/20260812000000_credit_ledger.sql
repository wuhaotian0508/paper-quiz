-- Prepaid credit, one row per movement of money. A balance is the sum of the rows and is
-- never stored as a number of its own: a running total drifts the first time a write is
-- retried, a ledger cannot.
create table public.paper_quiz_credit_entries (
  id uuid primary key default gen_random_uuid(),
  -- Not null, unlike a question report: credit that belongs to nobody cannot be spent by
  -- anybody, so a purchase we cannot attribute is a bug we want to see fail loudly.
  user_id uuid not null references auth.users(id) on delete cascade,
  -- Cents, positive for a top-up and negative for a refund. Money in a float rounds.
  amount_cents integer not null check (amount_cents <> 0),
  currency text not null default 'usd' check (char_length(currency) = 3),
  kind text not null check (kind in ('topup', 'refund')),
  -- Stripe delivers every webhook at least once, and retries anything we fail to ack. The
  -- event id is what makes the second delivery a no-op rather than a second credit.
  stripe_event_id text not null unique,
  stripe_session_id text,
  -- How a refund finds its payer: the refund event names the payment, not the learner.
  stripe_payment_intent_id text,
  created_at timestamptz not null default now()
);

create index paper_quiz_credit_entries_user_idx
  on public.paper_quiz_credit_entries (user_id, created_at desc);

create index paper_quiz_credit_entries_payment_intent_idx
  on public.paper_quiz_credit_entries (stripe_payment_intent_id);

alter table public.paper_quiz_credit_entries enable row level security;

-- Read-only for the learner, and only their own rows. Every write arrives from the Stripe
-- webhook through the service role, which bypasses RLS - there is deliberately no insert
-- grant, so no browser session can mint itself credit by talking to Supabase directly.
grant select on table public.paper_quiz_credit_entries to authenticated;

create policy "A learner reads their own credit" on public.paper_quiz_credit_entries
  for select using (user_id = auth.uid());
