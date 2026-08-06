-- Anki v3 (SM-2) spaced repetition scheduling state.
-- Run this in the Supabase SQL editor. Safe to re-run.

-- ---------------------------------------------------------------------------
-- Per-card scheduling state
-- ---------------------------------------------------------------------------
alter table public.flashcards
  -- 0 = new, 1 = learning, 2 = review, 3 = relearning
  add column if not exists card_type     smallint    not null default 0,
  -- exact timestamp for learning cards; day rollover for review cards
  add column if not exists due           timestamptz,
  add column if not exists interval_days integer     not null default 0,
  -- ease factor in permille (2500 = 2.50)
  add column if not exists ease_factor   integer     not null default 2500,
  add column if not exists reps          integer     not null default 0,
  add column if not exists lapses        integer     not null default 0,
  -- index of the current (re)learning step
  add column if not exists learning_step smallint    not null default 0,
  add column if not exists last_review   timestamptz,
  add column if not exists is_leech      boolean     not null default false;

do $$
begin
  alter table public.flashcards
    add constraint flashcards_card_type_check check (card_type between 0 and 3);
exception
  when duplicate_object then null;
end $$;

-- Due-queue lookups are the hot path.
create index if not exists flashcards_deck_due_idx
  on public.flashcards (deck_id, card_type, due);

-- ---------------------------------------------------------------------------
-- Per-deck options (Anki's deck options preset)
-- ---------------------------------------------------------------------------
alter table public.decks
  add column if not exists new_per_day     integer  not null default 20,
  add column if not exists reviews_per_day integer  not null default 200,
  -- hour of the local day at which a new Anki day starts
  add column if not exists rollover_hour   smallint not null default 4;

-- ---------------------------------------------------------------------------
-- Review log (Anki's revlog) — powers daily limits, undo, and future stats
-- ---------------------------------------------------------------------------
create table if not exists public.review_log (
  id              bigserial   primary key,
  user_id         uuid        not null references auth.users (id) on delete cascade,
  card_id         uuid        not null references public.flashcards (id) on delete cascade,
  deck_id         uuid        references public.decks (id) on delete set null,
  reviewed_at     timestamptz not null default now(),
  rating          smallint    not null check (rating between 1 and 4),
  -- card_type as it was *before* the answer, so daily counters can be derived
  state_before    smallint    not null,
  interval_before integer     not null default 0,
  interval_after  integer     not null default 0,
  ease_before     integer     not null default 0,
  ease_after      integer     not null default 0,
  time_taken_ms   integer     not null default 0
);

create index if not exists review_log_user_reviewed_idx
  on public.review_log (user_id, reviewed_at desc);

create index if not exists review_log_deck_reviewed_idx
  on public.review_log (deck_id, reviewed_at desc);

alter table public.review_log enable row level security;

drop policy if exists "review_log owner select" on public.review_log;
create policy "review_log owner select" on public.review_log
  for select using (auth.uid() = user_id);

drop policy if exists "review_log owner insert" on public.review_log;
create policy "review_log owner insert" on public.review_log
  for insert with check (auth.uid() = user_id);

drop policy if exists "review_log owner delete" on public.review_log;
create policy "review_log owner delete" on public.review_log
  for delete using (auth.uid() = user_id);
