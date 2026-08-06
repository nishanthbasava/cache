/**
 * A faithful port of Anki's SM-2 based v3 scheduler.
 *
 * Sources mirrored:
 *  - learning/relearning step handling: rslib/src/scheduler/states/{learning,relearning,steps}.rs
 *  - review interval chain: pylib/anki/scheduler/v3.py `_nextRevIvl` / `_constrainedIvl`
 *  - fuzz ranges: rslib/src/scheduler/states/fuzz.rs
 *
 * Everything here is pure — no I/O, no Supabase — so the maths can be reasoned
 * about (and tested) independently of the UI.
 */

export const CardType = {
  New: 0,
  Learning: 1,
  Review: 2,
  Relearning: 3,
} as const;
export type CardType = (typeof CardType)[keyof typeof CardType];

export const Rating = {
  Again: 1,
  Hard: 2,
  Good: 3,
  Easy: 4,
} as const;
export type Rating = (typeof Rating)[keyof typeof Rating];

export const RATINGS: Rating[] = [Rating.Again, Rating.Hard, Rating.Good, Rating.Easy];

/** Anki's per-deck options preset. Values are Anki's stock defaults. */
export interface DeckConfig {
  /** Learning steps in minutes. */
  learningSteps: number[];
  /** Relearning steps in minutes. */
  relearningSteps: number[];
  /** Days given when a card graduates with Good. */
  graduatingInterval: number;
  /** Days given when a card graduates with Easy. */
  easyInterval: number;
  /** Starting ease, in permille (2500 = 2.50). */
  initialEase: number;
  /** Easy bonus multiplier. */
  easyBonus: number;
  /** Global interval modifier. */
  intervalModifier: number;
  /** Hard interval multiplier. */
  hardMultiplier: number;
  /** New interval multiplier applied on a lapse. */
  lapseMultiplier: number;
  /** Minimum interval in days after a lapse. */
  minimumInterval: number;
  /** Maximum interval in days. */
  maximumInterval: number;
  /** Lapses before a card is tagged as a leech. */
  leechThreshold: number;
  newPerDay: number;
  reviewsPerDay: number;
  /** Learn-ahead limit in minutes. */
  learnAheadMinutes: number;
  /** Hour of the local day at which a new Anki day starts. */
  rolloverHour: number;
}

export const DEFAULT_DECK_CONFIG: DeckConfig = {
  learningSteps: [1, 10],
  relearningSteps: [10],
  graduatingInterval: 1,
  easyInterval: 4,
  initialEase: 2500,
  easyBonus: 1.3,
  intervalModifier: 1.0,
  hardMultiplier: 1.2,
  lapseMultiplier: 0.0,
  minimumInterval: 1,
  maximumInterval: 36500,
  leechThreshold: 8,
  newPerDay: 20,
  reviewsPerDay: 200,
  learnAheadMinutes: 20,
  rolloverHour: 4,
};

/** The scheduling state Anki keeps on every card. */
export interface CardSchedule {
  card_type: CardType;
  /** ISO timestamp. Null only for cards that have never been seen. */
  due: string | null;
  interval_days: number;
  /** Ease factor in permille. */
  ease_factor: number;
  reps: number;
  lapses: number;
  /** Index of the current (re)learning step. */
  learning_step: number;
  last_review: string | null;
  is_leech: boolean;
}

export const NEW_CARD_SCHEDULE: CardSchedule = {
  card_type: CardType.New,
  due: null,
  interval_days: 0,
  ease_factor: DEFAULT_DECK_CONFIG.initialEase,
  reps: 0,
  lapses: 0,
  learning_step: 0,
  last_review: null,
  is_leech: false,
};

// ---------------------------------------------------------------------------
// Day boundaries (Anki days roll over at 4am local time by default)
// ---------------------------------------------------------------------------

/** The moment the Anki day containing `t` began. */
export function startOfAnkiDay(t: Date, rolloverHour: number): Date {
  const start = new Date(t);
  start.setHours(rolloverHour, 0, 0, 0);
  if (start > t) start.setDate(start.getDate() - 1);
  return start;
}

/** The moment the Anki day containing `t` ends. */
export function nextDayCutoff(t: Date, rolloverHour: number): Date {
  const cutoff = startOfAnkiDay(t, rolloverHour);
  cutoff.setDate(cutoff.getDate() + 1);
  return cutoff;
}

/** Monotonic day counter, DST-safe (built from the local calendar date). */
export function ankiDayNumber(t: Date, rolloverHour: number): number {
  const s = startOfAnkiDay(t, rolloverHour);
  return Math.floor(Date.UTC(s.getFullYear(), s.getMonth(), s.getDate()) / 86_400_000);
}

// ---------------------------------------------------------------------------
// Interval fuzz
// ---------------------------------------------------------------------------

const FUZZ_RANGES = [
  { start: 2.5, end: 7.0, factor: 0.15 },
  { start: 7.0, end: 20.0, factor: 0.1 },
  { start: 20.0, end: Number.MAX_VALUE, factor: 0.05 },
];

function fuzzDelta(interval: number): number {
  if (interval < 2.5) return 0;
  const delta = FUZZ_RANGES.reduce(
    (acc, range) => acc + range.factor * Math.max(0, Math.min(interval, range.end) - range.start),
    0,
  );
  return Math.max(1, delta);
}

/** Spreads an interval within Anki's fuzz bounds. `roll` is a uniform [0, 1). */
export function fuzzInterval(interval: number, roll: number): number {
  const delta = fuzzDelta(interval);
  if (delta === 0) return Math.round(interval);
  const lower = Math.max(1, Math.round(interval - delta));
  const upper = Math.max(lower, Math.round(interval + delta));
  const picked = Math.floor(lower + roll * (upper - lower + 0.99));
  return Math.min(upper, Math.max(lower, picked));
}

/** Anki's `_constrainedIvl`: scale, fuzz, then keep each button ahead of the last. */
function constrainInterval(raw: number, cfg: DeckConfig, previous: number, roll: number): number {
  const scaled = Math.floor(raw * cfg.intervalModifier);
  const fuzzed = fuzzInterval(scaled, roll);
  return Math.min(cfg.maximumInterval, Math.max(fuzzed, previous + 1, 1));
}

// ---------------------------------------------------------------------------
// Step helpers
// ---------------------------------------------------------------------------

/**
 * Delay for Hard on a (re)learning card. On the first step Hard sits halfway to
 * the second step, or at 1.5x when there is no second step. Later steps repeat.
 */
function hardDelayMinutes(steps: number[], index: number): number {
  const current = steps[index] ?? steps[steps.length - 1] ?? 1;
  if (index > 0) return current;
  return steps.length > 1 ? (current + steps[1]) / 2 : current * 1.5;
}

function minutesFromNow(now: Date, minutes: number): string {
  return new Date(now.getTime() + Math.round(minutes * 60_000)).toISOString();
}

/** Day-granular due date: a review card comes up at that day's rollover. */
function daysFromNow(now: Date, days: number, cfg: DeckConfig): string {
  const due = startOfAnkiDay(now, cfg.rolloverHour);
  due.setDate(due.getDate() + days);
  return due.toISOString();
}

/** Anki tags a leech at the threshold, then every half-threshold lapses after. */
function isLeechAt(lapses: number, threshold: number): boolean {
  if (threshold <= 0 || lapses < threshold) return false;
  return (lapses - threshold) % Math.max(Math.floor(threshold / 2), 1) === 0;
}

// ---------------------------------------------------------------------------
// The scheduler
// ---------------------------------------------------------------------------

export type NextStates = Record<Rating, CardSchedule>;

type Rolls = { hard: number; good: number; easy: number };

/**
 * Computes the state the card would land in for each of the four buttons.
 *
 * Anki computes all four up front so the intervals printed on the buttons are
 * exactly what gets applied (fuzz included) — call this once per card shown and
 * persist whichever entry the user picks.
 */
export function nextStates(
  card: CardSchedule,
  cfg: DeckConfig = DEFAULT_DECK_CONFIG,
  now: Date = new Date(),
  rng: () => number = Math.random,
): NextStates {
  const rolls: Rolls = { hard: rng(), good: rng(), easy: rng() };

  switch (card.card_type) {
    case CardType.New:
    case CardType.Learning:
      return learningStates(card, cfg, now);
    case CardType.Relearning:
      return relearningStates(card, cfg, now);
    default:
      return reviewStates(card, cfg, now, rolls);
  }
}

/** Applies a rating and returns the new schedule. */
export function answerCard(
  card: CardSchedule,
  rating: Rating,
  cfg: DeckConfig = DEFAULT_DECK_CONFIG,
  now: Date = new Date(),
  rng: () => number = Math.random,
): CardSchedule {
  return nextStates(card, cfg, now, rng)[rating];
}

function reviewed(card: CardSchedule, now: Date): CardSchedule {
  return { ...card, reps: card.reps + 1, last_review: now.toISOString() };
}

function graduate(
  base: CardSchedule,
  cfg: DeckConfig,
  now: Date,
  days: number,
  easeFactor: number,
): CardSchedule {
  const interval = Math.min(cfg.maximumInterval, Math.max(1, days));
  return {
    ...base,
    card_type: CardType.Review,
    learning_step: 0,
    interval_days: interval,
    ease_factor: easeFactor,
    due: daysFromNow(now, interval, cfg),
  };
}

function learningStates(card: CardSchedule, cfg: DeckConfig, now: Date): NextStates {
  const steps = cfg.learningSteps.length ? cfg.learningSteps : [1];
  const step = card.card_type === CardType.New ? 0 : Math.min(card.learning_step, steps.length - 1);
  const base = reviewed(card, now);

  const stay = (index: number, minutes: number): CardSchedule => ({
    ...base,
    card_type: CardType.Learning,
    learning_step: index,
    interval_days: 0,
    due: minutesFromNow(now, minutes),
  });

  const good =
    step + 1 < steps.length
      ? stay(step + 1, steps[step + 1])
      : graduate(base, cfg, now, cfg.graduatingInterval, cfg.initialEase);

  return {
    [Rating.Again]: stay(0, steps[0]),
    [Rating.Hard]: stay(step, hardDelayMinutes(steps, step)),
    [Rating.Good]: good,
    [Rating.Easy]: graduate(base, cfg, now, cfg.easyInterval, cfg.initialEase),
  };
}

function relearningStates(card: CardSchedule, cfg: DeckConfig, now: Date): NextStates {
  const steps = cfg.relearningSteps;
  const step = steps.length ? Math.min(card.learning_step, steps.length - 1) : 0;
  const base = reviewed(card, now);

  // The post-lapse interval was already computed when the card lapsed.
  const lapsedInterval = Math.max(cfg.minimumInterval, card.interval_days);

  const stay = (index: number, minutes: number): CardSchedule => ({
    ...base,
    card_type: CardType.Relearning,
    learning_step: index,
    due: minutesFromNow(now, minutes),
  });

  // Relearning never touches ease — that was already reduced at lapse time.
  const back = (days: number) => graduate(base, cfg, now, days, card.ease_factor);

  return {
    [Rating.Again]: steps.length ? stay(0, steps[0]) : back(lapsedInterval),
    [Rating.Hard]: steps.length ? stay(step, hardDelayMinutes(steps, step)) : back(lapsedInterval),
    [Rating.Good]:
      step + 1 < steps.length ? stay(step + 1, steps[step + 1]) : back(lapsedInterval),
    [Rating.Easy]: back(Math.max(cfg.minimumInterval, card.interval_days + 1)),
  };
}

function reviewStates(card: CardSchedule, cfg: DeckConfig, now: Date, rolls: Rolls): NextStates {
  const base = reviewed(card, now);
  const interval = Math.max(1, card.interval_days);
  // Intervals use the ease as it was *before* this answer; the ease change is
  // applied afterwards. This ordering matters and matches Anki.
  const factor = card.ease_factor / 1000;
  const daysLate = card.due
    ? Math.max(
        0,
        ankiDayNumber(now, cfg.rolloverHour) - ankiDayNumber(new Date(card.due), cfg.rolloverHour),
      )
    : 0;

  // Again — a lapse.
  const lapses = card.lapses + 1;
  const lapsedInterval = Math.min(
    cfg.maximumInterval,
    Math.max(cfg.minimumInterval, Math.floor(interval * cfg.lapseMultiplier)),
  );
  const lapsed: CardSchedule = {
    ...base,
    lapses,
    is_leech: card.is_leech || isLeechAt(lapses, cfg.leechThreshold),
    ease_factor: Math.max(1300, card.ease_factor - 200),
    interval_days: lapsedInterval,
    learning_step: 0,
  };
  const again: CardSchedule = cfg.relearningSteps.length
    ? {
        ...lapsed,
        card_type: CardType.Relearning,
        due: minutesFromNow(now, cfg.relearningSteps[0]),
      }
    : {
        ...lapsed,
        card_type: CardType.Review,
        due: daysFromNow(now, lapsedInterval, cfg),
      };

  // Hard / Good / Easy — each is held at least a day above the previous button.
  const hardFloor = cfg.hardMultiplier > 1 ? interval : 0;
  const hardInterval = constrainInterval(interval * cfg.hardMultiplier, cfg, hardFloor, rolls.hard);
  const goodInterval = constrainInterval(
    (interval + Math.floor(daysLate / 2)) * factor,
    cfg,
    hardInterval,
    rolls.good,
  );
  const easyInterval = constrainInterval(
    (interval + daysLate) * factor * cfg.easyBonus,
    cfg,
    goodInterval,
    rolls.easy,
  );

  const passing = (days: number, easeFactor: number): CardSchedule => ({
    ...base,
    card_type: CardType.Review,
    learning_step: 0,
    interval_days: days,
    ease_factor: easeFactor,
    due: daysFromNow(now, days, cfg),
  });

  return {
    [Rating.Again]: again,
    [Rating.Hard]: passing(hardInterval, Math.max(1300, card.ease_factor - 150)),
    [Rating.Good]: passing(goodInterval, card.ease_factor),
    [Rating.Easy]: passing(easyInterval, card.ease_factor + 150),
  };
}

// ---------------------------------------------------------------------------
// Display
// ---------------------------------------------------------------------------

function formatDays(days: number): string {
  if (days < 30) return `${days}d`;
  if (days < 365) return `${trim(days / 30)}mo`;
  return `${trim(days / 365)}y`;
}

function trim(value: number): string {
  return value.toFixed(1).replace(/\.0$/, "");
}

/** The interval label Anki prints on an answer button. */
export function intervalLabel(state: CardSchedule, now: Date = new Date()): string {
  if (state.card_type === CardType.Review) return formatDays(state.interval_days);

  const seconds = state.due ? (new Date(state.due).getTime() - now.getTime()) / 1000 : 0;
  if (seconds < 60) return "<1m";
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  if (seconds < 86_400) return `${trim(seconds / 3600)}h`;
  return formatDays(Math.round(seconds / 86_400));
}
