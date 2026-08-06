"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import StudySession from "@/components/StudySession";
import { fetchDeckDueCounts } from "@/lib/study";
import type { QueueCounts } from "@/lib/scheduler";
import type { Deck, Flashcard } from "@/lib/types";

export default function FlashcardDeck() {
  const [decks, setDecks] = useState<Deck[]>([]);
  const [dueCounts, setDueCounts] = useState<Record<string, QueueCounts>>({});
  const [studyDeck, setStudyDeck] = useState<Deck | null>(null);
  const [selectedDeck, setSelectedDeck] = useState<Deck | null>(null);
  const [cards, setCards] = useState<Flashcard[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [loading, setLoading] = useState(true);
  const [newDeckName, setNewDeckName] = useState("");
  const [creating, setCreating] = useState(false);
  const [slideDirection, setSlideDirection] = useState<"left" | "right" | null>(null);
  const [animating, setAnimating] = useState(false);
  const [displayIndex, setDisplayIndex] = useState(0);
  const nextIndexRef = useRef<number>(0);

  useEffect(() => {
    fetchDecks();
  }, []);

  async function fetchDecks() {
    try {
      const supabase = createClient();
      const { data } = await supabase
        .from("decks")
        .select("*")
        .order("created_at", { ascending: false });
      const list = data ?? [];
      setDecks(list);

      try {
        setDueCounts(await fetchDeckDueCounts(list));
      } catch (err) {
        // The deck list still works without badges if the migration hasn't run.
        console.error("Failed to compute due counts:", err);
      }
    } catch (err) {
      console.error("Failed to fetch decks:", err);
    } finally {
      setLoading(false);
    }
  }

  async function createDeck() {
    const name = newDeckName.trim();
    if (!name) return;

    setCreating(true);

    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) return;

      const { data, error } = await supabase
        .from("decks")
        .insert({ name, user_id: user.id })
        .select()
        .single();

      if (error) throw error;

      setDecks((prev) => [data, ...prev]);
      setNewDeckName("");
    } catch (err) {
      console.error("Failed to create deck:", err);
    } finally {
      setCreating(false);
    }
  }

  async function openDeck(deck: Deck) {
    setSelectedDeck(deck);
    setCurrentIndex(0);
    setFlipped(false);

    const supabase = createClient();
    const { data } = await supabase
      .from("flashcards")
      .select("*")
      .eq("deck_id", deck.id)
      .order("created_at", { ascending: false });

    setCards(data ?? []);
  }

  if (loading) {
    return <p className="text-center text-sm text-muted-foreground">Loading...</p>;
  }

  // Spaced repetition session
  if (studyDeck) {
    return (
      <StudySession
        deck={studyDeck}
        onExit={() => {
          setStudyDeck(null);
          void fetchDecks();
        }}
      />
    );
  }

  // Viewing a deck's flashcards
  if (selectedDeck) {
    if (cards.length === 0) {
      return (
        <div className="flex flex-col gap-4">
          <button
            type="button"
            onClick={() => setSelectedDeck(null)}
            className="self-start text-sm text-muted-foreground hover:text-foreground"
          >
            Back to folders
          </button>
          <p className="text-center text-sm text-muted-foreground">
            No flashcards in &ldquo;{selectedDeck.name}&rdquo; yet.
          </p>
        </div>
      );
    }

    function navigateCard(direction: "left" | "right") {
      if (animating) return;

      const nextIdx =
        direction === "right"
          ? (currentIndex + 1) % cards.length
          : (currentIndex - 1 + cards.length) % cards.length;

      nextIndexRef.current = nextIdx;
      setDisplayIndex(currentIndex);
      setFlipped(false);
      setSlideDirection(direction);
      setAnimating(true);
    }

    function handleTransitionEnd() {
      setCurrentIndex(nextIndexRef.current);
      setDisplayIndex(nextIndexRef.current);
      setSlideDirection(null);
      setAnimating(false);
    }

    const card = cards[animating ? displayIndex : currentIndex];
    const nextCard = animating ? cards[nextIndexRef.current] : null;

    return (
      <div className="flex flex-col gap-4">
        <button
          type="button"
          onClick={() => setSelectedDeck(null)}
          className="self-start text-sm text-muted-foreground hover:text-foreground"
        >
          Back to folders
        </button>

        <h2 className="font-heading text-lg font-bold">{selectedDeck.name}</h2>

        <p className="text-center text-sm text-muted-foreground">
          Card {currentIndex + 1} of {cards.length}
        </p>

        <div className="flashcard-track-wrapper overflow-hidden">
          <div
            className={`flashcard-track ${
              slideDirection === "right"
                ? "slide-next"
                : slideDirection === "left"
                  ? "slide-prev"
                  : ""
            }`}
            onTransitionEnd={handleTransitionEnd}
          >
            {/* Previous card (off-screen left) */}
            <div className="flashcard-track-card" aria-hidden>
              {nextCard && slideDirection === "left" && (
                <div className="flashcard-perspective">
                  <div className="flashcard-inner">
                    <div className="flashcard-face bg-card">
                      <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Question
                      </p>
                      <p className="text-lg leading-relaxed">{nextCard.front}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Current card (visible) */}
            <div
              className="flashcard-track-card"
              role="button"
              tabIndex={0}
              onClick={() => !animating && setFlipped(!flipped)}
              onKeyDown={(e) => {
                if (e.key === " " || e.key === "Enter") !animating && setFlipped(!flipped);
              }}
            >
              <div className="flashcard-perspective cursor-pointer select-none">
                <div className={`flashcard-inner ${flipped ? "flipped" : ""}`}>
                  <div className="flashcard-face bg-card">
                    <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Question
                    </p>
                    <p className="text-lg leading-relaxed">{card.front}</p>
                  </div>

                  <div className="flashcard-face flashcard-back bg-card">
                    <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Answer
                    </p>
                    <p className="text-lg leading-relaxed">{card.back}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Next card (off-screen right) */}
            <div className="flashcard-track-card" aria-hidden>
              {nextCard && slideDirection === "right" && (
                <div className="flashcard-perspective">
                  <div className="flashcard-inner">
                    <div className="flashcard-face bg-card">
                      <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Question
                      </p>
                      <p className="text-lg leading-relaxed">{nextCard.front}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <p className="text-center text-xs text-muted-foreground">
          Tap card to flip
        </p>

        <div className="flex gap-3">
          <button
            type="button"
            disabled={animating}
            onClick={() => navigateCard("left")}
            className="flex-1 rounded-lg border px-4 py-3"
          >
            Previous
          </button>

          <button
            type="button"
            disabled={animating}
            onClick={() => navigateCard("right")}
            className="flex-1 rounded-lg border px-4 py-3"
          >
            Next
          </button>
        </div>
      </div>
    );
  }

  // Deck list view
  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2">
        <input
          type="text"
          value={newDeckName}
          onChange={(e) => setNewDeckName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && createDeck()}
          placeholder="New folder name..."
          className="h-11 flex-1 rounded-lg border bg-background px-3 text-base outline-none transition-shadow placeholder:text-muted-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
        />
        <button
          type="button"
          onClick={createDeck}
          disabled={creating || !newDeckName.trim()}
          className="rounded-lg bg-primary px-4 py-3 text-primary-foreground disabled:opacity-50"
        >
          {creating ? "..." : "Create"}
        </button>
      </div>

      {decks.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground">
          Create a folder to get started.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {decks.map((deck) => {
            const counts = dueCounts[deck.id];
            return (
              <div
                key={deck.id}
                className="flex items-center gap-3 rounded-xl border p-4 transition-colors hover:bg-muted/50"
              >
                <button
                  type="button"
                  onClick={() => openDeck(deck)}
                  className="flex-1 text-left"
                >
                  <p className="font-medium">{deck.name}</p>
                  {counts && (
                    <p className="mt-1 flex gap-3 text-xs tabular-nums">
                      <span className="text-sky-600 dark:text-sky-400">{counts.new} new</span>
                      <span className="text-red-600 dark:text-red-400">
                        {counts.learning} learning
                      </span>
                      <span className="text-green-600 dark:text-green-400">
                        {counts.review} to review
                      </span>
                    </p>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setStudyDeck(deck)}
                  disabled={counts?.total === 0}
                  className="rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-40"
                >
                  Study
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
