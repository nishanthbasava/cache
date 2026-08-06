-- The study session updates flashcards from the browser, so the table needs a
-- row-level security UPDATE policy. Without one Postgres filters the row out and
-- reports success with zero rows changed, silently discarding review progress.
-- Run this in the Supabase SQL editor. Safe to re-run.

alter table public.flashcards enable row level security;

drop policy if exists "flashcards owner select" on public.flashcards;
create policy "flashcards owner select" on public.flashcards
  for select using (auth.uid() = user_id);

drop policy if exists "flashcards owner insert" on public.flashcards;
create policy "flashcards owner insert" on public.flashcards
  for insert with check (auth.uid() = user_id);

drop policy if exists "flashcards owner update" on public.flashcards;
create policy "flashcards owner update" on public.flashcards
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "flashcards owner delete" on public.flashcards;
create policy "flashcards owner delete" on public.flashcards
  for delete using (auth.uid() = user_id);

-- Clear the review log rows written by answers whose card update was rejected.
-- A logged review on a card with zero reps can only be one of those lost writes;
-- leaving them would keep counting against the daily new-card limit.
delete from public.review_log rl
using public.flashcards f
where f.id = rl.card_id
  and f.reps = 0;
