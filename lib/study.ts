import { createClient } from "@/lib/supabase/client";
import {
  CardType,
  DEFAULT_DECK_CONFIG,
  buildQueue,
  countQueue,
  startOfAnkiDay,
  type CardSchedule,
  type DeckConfig,
  type QueueCounts,
  type Rating,
} from "@/lib/scheduler";
import type { Deck, Flashcard } from "@/lib/types";

/** Merges a deck's stored options over Anki's stock defaults. */
export function deckConfig(deck: Deck): DeckConfig {
  return {
    ...DEFAULT_DECK_CONFIG,
    newPerDay: deck.new_per_day ?? DEFAULT_DECK_CONFIG.newPerDay,
    reviewsPerDay: deck.reviews_per_day ?? DEFAULT_DECK_CONFIG.reviewsPerDay,
    rolloverHour: deck.rollover_hour ?? DEFAULT_DECK_CONFIG.rolloverHour,
  };
}

export interface DailyCounts {
  /** New cards introduced today. */
  introduced: number;
  /** Review-state cards answered today. */
  reviews: number;
}

export async function fetchDeckCards(deckId: string): Promise<Flashcard[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("flashcards")
    .select("*")
    .eq("deck_id", deckId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return (data ?? []) as Flashcard[];
}

/**
 * Derives today's counters from the review log rather than storing them, so
 * they stay correct across devices and survive the daily rollover for free.
 */
export async function fetchDailyCounts(
  deckId: string,
  cfg: DeckConfig,
  now: Date = new Date(),
): Promise<DailyCounts> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("review_log")
    .select("card_id, state_before")
    .eq("deck_id", deckId)
    .gte("reviewed_at", startOfAnkiDay(now, cfg.rolloverHour).toISOString());

  if (error) throw error;

  const introduced = new Set<string>();
  let reviews = 0;

  for (const row of data ?? []) {
    if (row.state_before === CardType.New) introduced.add(row.card_id);
    else if (row.state_before === CardType.Review) reviews += 1;
  }

  return { introduced: introduced.size, reviews };
}

/**
 * Due counts for every deck at once, for the deck list badges. Two queries
 * total rather than one pair per deck.
 */
export async function fetchDeckDueCounts(
  decks: Deck[],
  now: Date = new Date(),
): Promise<Record<string, QueueCounts>> {
  if (decks.length === 0) return {};

  const configs = new Map(decks.map((deck) => [deck.id, deckConfig(deck)] as const));
  const earliest = Math.min(
    ...decks.map((deck) => startOfAnkiDay(now, configs.get(deck.id)!.rolloverHour).getTime()),
  );

  const supabase = createClient();
  const [cardsResult, logsResult] = await Promise.all([
    supabase.from("flashcards").select("*"),
    supabase
      .from("review_log")
      .select("deck_id, card_id, state_before, reviewed_at")
      .gte("reviewed_at", new Date(earliest).toISOString()),
  ]);

  if (cardsResult.error) throw cardsResult.error;
  if (logsResult.error) throw logsResult.error;

  const cardsByDeck = new Map<string, Flashcard[]>();
  for (const card of (cardsResult.data ?? []) as Flashcard[]) {
    if (!card.deck_id) continue;
    const bucket = cardsByDeck.get(card.deck_id);
    if (bucket) bucket.push(card);
    else cardsByDeck.set(card.deck_id, [card]);
  }

  const counts: Record<string, QueueCounts> = {};

  for (const deck of decks) {
    const cfg = configs.get(deck.id)!;
    const dayStart = startOfAnkiDay(now, cfg.rolloverHour).getTime();

    const introduced = new Set<string>();
    let reviews = 0;
    for (const row of logsResult.data ?? []) {
      if (row.deck_id !== deck.id) continue;
      if (new Date(row.reviewed_at).getTime() < dayStart) continue;
      if (row.state_before === CardType.New) introduced.add(row.card_id);
      else if (row.state_before === CardType.Review) reviews += 1;
    }

    const queue = buildQueue(
      cardsByDeck.get(deck.id) ?? [],
      cfg,
      now,
      cfg.newPerDay - introduced.size,
      cfg.reviewsPerDay - reviews,
    );
    counts[deck.id] = countQueue(queue);
  }

  return counts;
}

const SCHEDULE_COLUMNS = [
  "card_type",
  "due",
  "interval_days",
  "ease_factor",
  "reps",
  "lapses",
  "learning_step",
  "last_review",
  "is_leech",
] as const;

function scheduleRow(schedule: CardSchedule): Record<string, unknown> {
  return Object.fromEntries(SCHEDULE_COLUMNS.map((key) => [key, schedule[key]]));
}

/**
 * Writes a card's schedule, insisting a row actually changed.
 *
 * Without this check a missing row-level security UPDATE policy is invisible:
 * Postgres filters the row out of the update and reports success with zero rows
 * affected, so review progress silently evaporates.
 */
async function writeSchedule(cardId: string, schedule: CardSchedule): Promise<void> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("flashcards")
    .update(scheduleRow(schedule))
    .eq("id", cardId)
    .select("id");

  if (error) throw error;
  if (!data || data.length === 0) {
    throw new Error(
      "The card was not updated. Check that flashcards has a row-level security UPDATE policy.",
    );
  }
}

export interface AnswerRecord {
  /** Review log row id, so the answer can be undone. */
  logId: number | null;
}

/** Persists an answer: the card's new state plus a review log entry. */
export async function recordAnswer(params: {
  card: Flashcard;
  before: CardSchedule;
  after: CardSchedule;
  rating: Rating;
  userId: string;
  timeTakenMs: number;
}): Promise<AnswerRecord> {
  const { card, before, after, rating, userId, timeTakenMs } = params;
  const supabase = createClient();

  await writeSchedule(card.id, after);

  const { data, error: logError } = await supabase
    .from("review_log")
    .insert({
      user_id: userId,
      card_id: card.id,
      deck_id: card.deck_id,
      rating,
      state_before: before.card_type,
      interval_before: before.interval_days,
      interval_after: after.interval_days,
      ease_before: before.ease_factor,
      ease_after: after.ease_factor,
      time_taken_ms: timeTakenMs,
    })
    .select("id")
    .single();

  if (logError) {
    console.error("Failed to write review log:", logError);
    return { logId: null };
  }

  return { logId: data.id as number };
}

/** Restores a card's previous state and drops its review log entry. */
export async function undoAnswer(
  cardId: string,
  before: CardSchedule,
  logId: number | null,
): Promise<void> {
  await writeSchedule(cardId, before);

  if (logId !== null) {
    await createClient().from("review_log").delete().eq("id", logId);
  }
}
