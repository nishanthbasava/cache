"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  CardType,
  RATINGS,
  Rating,
  buildQueue,
  countQueue,
  intervalLabel,
  nextLearningDue,
  nextStates,
  pickNextCard,
  type CardSchedule,
  type NextStates,
  type QueueCounts,
} from "@/lib/scheduler";
import {
  deckConfig,
  fetchDailyCounts,
  fetchDeckCards,
  recordAnswer,
  undoAnswer,
} from "@/lib/study";
import type { Deck, Flashcard } from "@/lib/types";

const RATING_LABELS: Record<Rating, string> = {
  [Rating.Again]: "Again",
  [Rating.Hard]: "Hard",
  [Rating.Good]: "Good",
  [Rating.Easy]: "Easy",
};

const RATING_STYLES: Record<Rating, string> = {
  [Rating.Again]: "border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-400",
  [Rating.Hard]: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  [Rating.Good]: "border-green-500/40 bg-green-500/10 text-green-700 dark:text-green-400",
  [Rating.Easy]: "border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-400",
};

interface HistoryEntry {
  cardId: string;
  before: CardSchedule;
  logId: number | null;
  wasNew: boolean;
  wasReview: boolean;
}

function scheduleOf(card: Flashcard): CardSchedule {
  return {
    card_type: card.card_type,
    due: card.due,
    interval_days: card.interval_days,
    ease_factor: card.ease_factor,
    reps: card.reps,
    lapses: card.lapses,
    learning_step: card.learning_step,
    last_review: card.last_review,
    is_leech: card.is_leech,
  };
}

function formatWait(until: Date, now: Date): string {
  const minutes = Math.max(1, Math.ceil((until.getTime() - now.getTime()) / 60_000));
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  const hours = Math.round(minutes / 60);
  return `${hours} hour${hours === 1 ? "" : "s"}`;
}

export default function StudySession({ deck, onExit }: { deck: Deck; onExit: () => void }) {
  const cfg = useMemo(() => deckConfig(deck), [deck]);

  const [cards, setCards] = useState<Flashcard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  const [introduced, setIntroduced] = useState(0);
  const [reviewsDone, setReviewsDone] = useState(0);

  const [currentId, setCurrentId] = useState<string | null>(null);
  const [preview, setPreview] = useState<NextStates | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [counts, setCounts] = useState<QueueCounts>({ new: 0, learning: 0, review: 0, total: 0 });
  const [waitingUntil, setWaitingUntil] = useState<Date | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  const shownAt = useRef<number>(0);
  const answering = useRef(false);

  const current = cards.find((c) => c.id === currentId) ?? null;

  /** Recomputes the queue and selects the next card to show. */
  const advance = useCallback(
    (list: Flashcard[], newDone: number, revDone: number) => {
      const now = new Date();
      const queue = buildQueue(
        list,
        cfg,
        now,
        cfg.newPerDay - newDone,
        cfg.reviewsPerDay - revDone,
      );
      const next = pickNextCard(queue, cfg, now);

      setCounts(countQueue(queue));
      setCurrentId(next?.id ?? null);
      setPreview(next ? nextStates(next, cfg, now) : null);
      setWaitingUntil(next ? null : nextLearningDue(queue));
      setRevealed(false);
      shownAt.current = now.getTime();
    },
    [cfg],
  );

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const supabase = createClient();
        const [{ data: auth }, deckCards, daily] = await Promise.all([
          supabase.auth.getUser(),
          fetchDeckCards(deck.id),
          fetchDailyCounts(deck.id, cfg),
        ]);

        if (cancelled) return;

        setUserId(auth.user?.id ?? null);
        setCards(deckCards);
        setIntroduced(daily.introduced);
        setReviewsDone(daily.reviews);
        advance(deckCards, daily.introduced, daily.reviews);
      } catch (err) {
        console.error("Failed to start study session:", err);
        if (!cancelled) setError("Could not load this deck. Has the scheduler migration been run?");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [deck.id, cfg, advance]);

  // Re-check the queue while waiting for a learning card to come due.
  const latest = useRef({ cards, introduced, reviewsDone });
  useEffect(() => {
    latest.current = { cards, introduced, reviewsDone };
  });

  useEffect(() => {
    if (!waitingUntil) return;
    const timer = setInterval(() => {
      const { cards: list, introduced: newDone, reviewsDone: revDone } = latest.current;
      advance(list, newDone, revDone);
    }, 10_000);
    return () => clearInterval(timer);
  }, [waitingUntil, advance]);

  const answer = useCallback(
    async (rating: Rating) => {
      if (!current || !preview || answering.current) return;
      answering.current = true;

      const before = scheduleOf(current);
      const after = preview[rating];
      const wasNew = before.card_type === CardType.New;
      const wasReview = before.card_type === CardType.Review;

      const nextIntroduced = introduced + (wasNew ? 1 : 0);
      const nextReviewsDone = reviewsDone + (wasReview ? 1 : 0);
      const updated = cards.map((c) => (c.id === current.id ? { ...c, ...after } : c));

      setCards(updated);
      setIntroduced(nextIntroduced);
      setReviewsDone(nextReviewsDone);
      advance(updated, nextIntroduced, nextReviewsDone);

      try {
        if (!userId) throw new Error("Not signed in.");
        const { logId } = await recordAnswer({
          card: current,
          before,
          after,
          rating,
          userId,
          timeTakenMs: Math.min(60_000, Date.now() - shownAt.current),
        });
        setHistory((prev) => [...prev, { cardId: current.id, before, logId, wasNew, wasReview }]);
        setError(null);
      } catch (err) {
        // Roll the optimistic update back so the session never drifts away from
        // what's actually stored.
        console.error("Failed to save answer:", err);
        const reverted = cards.map((c) => (c.id === current.id ? { ...c, ...before } : c));
        setCards(reverted);
        setIntroduced(introduced);
        setReviewsDone(reviewsDone);
        advance(reverted, introduced, reviewsDone);
        setError(err instanceof Error ? err.message : "That answer could not be saved.");
      } finally {
        answering.current = false;
      }
    },
    [advance, cards, current, introduced, preview, reviewsDone, userId],
  );

  const undo = useCallback(async () => {
    const last = history[history.length - 1];
    if (!last || answering.current) return;

    const nextIntroduced = introduced - (last.wasNew ? 1 : 0);
    const nextReviewsDone = reviewsDone - (last.wasReview ? 1 : 0);
    const updated = cards.map((c) => (c.id === last.cardId ? { ...c, ...last.before } : c));

    setCards(updated);
    setIntroduced(nextIntroduced);
    setReviewsDone(nextReviewsDone);
    setHistory((prev) => prev.slice(0, -1));
    advance(updated, nextIntroduced, nextReviewsDone);
    setCurrentId(last.cardId);
    setPreview(nextStates({ ...last.before }, cfg, new Date()));

    try {
      await undoAnswer(last.cardId, last.before, last.logId);
    } catch (err) {
      console.error("Failed to undo:", err);
      setError("That answer could not be undone.");
    }
  }, [advance, cards, cfg, history, introduced, reviewsDone]);

  // Anki's keyboard bindings: space reveals then answers Good, 1–4 rate.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.target instanceof HTMLInputElement) return;

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        void undo();
        return;
      }

      if (!current) return;

      if (!revealed) {
        if (event.key === " " || event.key === "Enter") {
          event.preventDefault();
          setRevealed(true);
        }
        return;
      }

      if (event.key === " " || event.key === "Enter") {
        event.preventDefault();
        void answer(Rating.Good);
        return;
      }

      const digit = Number(event.key);
      if (RATINGS.includes(digit as Rating)) {
        event.preventDefault();
        void answer(digit as Rating);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [answer, current, revealed, undo]);

  if (loading) {
    return <p className="text-center text-sm text-muted-foreground">Loading...</p>;
  }

  const header = (
    <div className="flex items-center justify-between">
      <button
        type="button"
        onClick={onExit}
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        Back to folders
      </button>
      <button
        type="button"
        onClick={() => void undo()}
        disabled={history.length === 0}
        className="text-sm text-muted-foreground hover:text-foreground disabled:opacity-40"
      >
        Undo
      </button>
    </div>
  );

  if (error && !current) {
    return (
      <div className="flex flex-col gap-4">
        {header}
        <p className="text-center text-sm text-red-500">{error}</p>
      </div>
    );
  }

  if (!current) {
    return (
      <div className="flex flex-col gap-4">
        {header}
        <h2 className="font-heading text-lg font-bold">{deck.name}</h2>
        <div className="rounded-xl border p-6 text-center">
          <p className="font-heading text-lg font-bold">Congratulations!</p>
          <p className="mt-2 text-sm text-muted-foreground">
            {waitingUntil
              ? `You've finished for now. More cards are ready in ${formatWait(waitingUntil, new Date())}.`
              : "You've finished this deck for today."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {header}

      <h2 className="font-heading text-lg font-bold">{deck.name}</h2>

      <div className="flex justify-center gap-4 text-sm font-medium tabular-nums">
        <span className="text-sky-600 dark:text-sky-400" title="New">
          {counts.new}
        </span>
        <span className="text-red-600 dark:text-red-400" title="Learning">
          {counts.learning}
        </span>
        <span className="text-green-600 dark:text-green-400" title="To review">
          {counts.review}
        </span>
      </div>

      <div
        role="button"
        tabIndex={0}
        onClick={() => !revealed && setRevealed(true)}
        onKeyDown={(e) => {
          if (e.key === " " || e.key === "Enter") setRevealed(true);
        }}
        className="flashcard-perspective cursor-pointer select-none"
      >
        <div className={`flashcard-inner ${revealed ? "flipped" : ""}`}>
          <div className="flashcard-face bg-card">
            <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Question
            </p>
            <p className="text-lg leading-relaxed">{current.front}</p>
          </div>

          <div className="flashcard-face flashcard-back bg-card">
            <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Answer
            </p>
            <p className="text-lg leading-relaxed">{current.back}</p>
          </div>
        </div>
      </div>

      {current.is_leech && (
        <p className="text-center text-xs text-amber-600 dark:text-amber-400">
          Leech — you&rsquo;ve forgotten this one {current.lapses} times. Consider rewriting it.
        </p>
      )}

      {revealed && preview ? (
        <div className="grid grid-cols-4 gap-2">
          {RATINGS.map((rating) => (
            <button
              key={rating}
              type="button"
              onClick={() => void answer(rating)}
              className={`flex flex-col items-center gap-0.5 rounded-lg border px-2 py-3 transition-opacity hover:opacity-80 ${RATING_STYLES[rating]}`}
            >
              <span className="text-sm font-medium">{RATING_LABELS[rating]}</span>
              <span className="text-xs tabular-nums opacity-80">
                {intervalLabel(preview[rating], new Date())}
              </span>
            </button>
          ))}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setRevealed(true)}
          className="rounded-lg bg-primary px-4 py-3 text-primary-foreground"
        >
          Show Answer
        </button>
      )}

      <p className="text-center text-xs text-muted-foreground">
        {revealed ? "Press 1–4 to rate, or space for Good" : "Tap the card or press space"}
      </p>

      {error && <p className="text-center text-xs text-red-500">{error}</p>}
    </div>
  );
}
