/**
 * Queue building, mirroring Anki's v3 gathering/sorting rules:
 * intraday learning cards win as soon as they come due, new cards are mixed
 * evenly into the review queue, and the learn-ahead limit lets learning cards
 * come up early once nothing else is left.
 */

import {
  CardType,
  type CardSchedule,
  type DeckConfig,
  startOfAnkiDay,
} from "./anki";

export interface QueuedCard extends CardSchedule {
  id: string;
  created_at: string;
}

export interface StudyQueue<T extends QueuedCard> {
  /** Learning + relearning cards, soonest due first. */
  learning: T[];
  /** Review cards due today, capped by the daily review limit. */
  review: T[];
  /** Unseen cards, capped by the daily new limit. */
  fresh: T[];
}

export interface QueueCounts {
  new: number;
  learning: number;
  review: number;
  total: number;
}

function dueTime(card: QueuedCard): number {
  return card.due ? new Date(card.due).getTime() : 0;
}

export function buildQueue<T extends QueuedCard>(
  cards: T[],
  cfg: DeckConfig,
  now: Date,
  newRemaining: number,
  reviewRemaining: number,
): StudyQueue<T> {
  const dayStart = startOfAnkiDay(now, cfg.rolloverHour).getTime();

  const learning = cards
    .filter((c) => c.card_type === CardType.Learning || c.card_type === CardType.Relearning)
    .sort((a, b) => dueTime(a) - dueTime(b));

  const review = cards
    .filter((c) => c.card_type === CardType.Review && dueTime(c) <= dayStart)
    .sort((a, b) => dueTime(a) - dueTime(b))
    .slice(0, Math.max(0, reviewRemaining));

  const fresh = cards
    .filter((c) => c.card_type === CardType.New)
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .slice(0, Math.max(0, newRemaining));

  return { learning, review, fresh };
}

/** Anki's "mix with reviews" new-card gather order: spread evenly through reviews. */
function mixNewWithReviews<T>(reviews: T[], fresh: T[]): T[] {
  if (!fresh.length) return reviews;
  if (!reviews.length) return fresh;

  const total = reviews.length + fresh.length;
  const out: T[] = [];
  let r = 0;
  let n = 0;

  for (let i = 0; i < total; i++) {
    const wantNew = n < fresh.length && n * total <= i * fresh.length;
    if (wantNew) out.push(fresh[n++]);
    else if (r < reviews.length) out.push(reviews[r++]);
    else out.push(fresh[n++]);
  }

  return out;
}

/**
 * Picks the card to show next, or null when the session is finished for now.
 * Learning cards that have come due preempt everything else; once new and
 * review cards run out, learning cards within the learn-ahead limit are pulled
 * forward the way Anki does.
 */
export function pickNextCard<T extends QueuedCard>(
  queue: StudyQueue<T>,
  cfg: DeckConfig,
  now: Date,
): T | null {
  const nowMs = now.getTime();

  const dueNow = queue.learning.find((c) => dueTime(c) <= nowMs);
  if (dueNow) return dueNow;

  const mixed = mixNewWithReviews(queue.review, queue.fresh);
  if (mixed.length) return mixed[0];

  const aheadLimit = nowMs + cfg.learnAheadMinutes * 60_000;
  return queue.learning.find((c) => dueTime(c) <= aheadLimit) ?? null;
}

/** The soonest a learning card comes up, when nothing is showable right now. */
export function nextLearningDue<T extends QueuedCard>(queue: StudyQueue<T>): Date | null {
  const soonest = queue.learning[0];
  return soonest?.due ? new Date(soonest.due) : null;
}

export function countQueue<T extends QueuedCard>(queue: StudyQueue<T>): QueueCounts {
  const counts = {
    new: queue.fresh.length,
    learning: queue.learning.length,
    review: queue.review.length,
  };
  return { ...counts, total: counts.new + counts.learning + counts.review };
}
