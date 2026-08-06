import type { CardSchedule } from "@/lib/scheduler";

export interface Deck {
  id: string;
  user_id: string;
  name: string;
  created_at: string;
  /** Deck options — optional so decks fetched before the migration still work. */
  new_per_day?: number | null;
  reviews_per_day?: number | null;
  rollover_hour?: number | null;
}

export interface Flashcard extends CardSchedule {
  id: string;
  user_id: string;
  front: string;
  back: string;
  source_filename: string | null;
  deck: string;
  deck_id: string | null;
  created_at: string;
}

export interface ReviewLogEntry {
  id: number;
  user_id: string;
  card_id: string;
  deck_id: string | null;
  reviewed_at: string;
  rating: number;
  /** Card type before the answer — 0 new, 1 learning, 2 review, 3 relearning. */
  state_before: number;
  interval_before: number;
  interval_after: number;
  ease_before: number;
  ease_after: number;
  time_taken_ms: number;
}
