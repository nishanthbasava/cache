"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Flashcard } from "@/lib/types";

export default function FlashcardDeck() {
  const [cards, setCards] = useState<Flashcard[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchCards() {
      try {
        const supabase = createClient();
        const { data } = await supabase
          .from("flashcards")
          .select("*")
          .order("created_at", { ascending: false });

        setCards(data ?? []);
      } catch (err) {
        console.error("Failed to fetch flashcards:", err);
      } finally {
        setLoading(false);
      }
    }

    fetchCards();
  }, []);

  if (loading) {
    return <p className="text-center text-sm text-muted-foreground">Loading...</p>;
  }

  if (cards.length === 0) {
    return (
      <p className="text-center text-sm text-muted-foreground">
        No flashcards yet. Capture or upload something to get started.
      </p>
    );
  }

  const card = cards[currentIndex];

  function next() {
    setFlipped(false);
    setCurrentIndex((i) => (i + 1) % cards.length);
  }

  function prev() {
    setFlipped(false);
    setCurrentIndex((i) => (i - 1 + cards.length) % cards.length);
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-center text-sm text-muted-foreground">
        Card {currentIndex + 1} of {cards.length}
      </p>

      <button
        type="button"
        onClick={() => setFlipped(!flipped)}
        className="min-h-[200px] rounded-xl border p-6 text-left transition-colors hover:bg-muted/50"
      >
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {flipped ? "Answer" : "Question"}
        </p>
        <p className="text-lg">{flipped ? card.back : card.front}</p>
      </button>

      <p className="text-center text-xs text-muted-foreground">
        Tap card to flip
      </p>

      <div className="flex gap-3">
        <button
          type="button"
          onClick={prev}
          className="flex-1 rounded-lg border px-4 py-3"
        >
          Previous
        </button>

        <button
          type="button"
          onClick={next}
          className="flex-1 rounded-lg border px-4 py-3"
        >
          Next
        </button>
      </div>
    </div>
  );
}
