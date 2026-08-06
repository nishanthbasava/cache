"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Deck, Flashcard } from "@/lib/types";

export default function FlashcardDeck() {
  const [decks, setDecks] = useState<Deck[]>([]);
  const [selectedDeck, setSelectedDeck] = useState<Deck | null>(null);
  const [cards, setCards] = useState<Flashcard[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [loading, setLoading] = useState(true);
  const [newDeckName, setNewDeckName] = useState("");
  const [creating, setCreating] = useState(false);

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
      setDecks(data ?? []);
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

    const card = cards[currentIndex];

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
            onClick={() => {
              setFlipped(false);
              setCurrentIndex((i) => (i - 1 + cards.length) % cards.length);
            }}
            className="flex-1 rounded-lg border px-4 py-3"
          >
            Previous
          </button>

          <button
            type="button"
            onClick={() => {
              setFlipped(false);
              setCurrentIndex((i) => (i + 1) % cards.length);
            }}
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
          {decks.map((deck) => (
            <button
              key={deck.id}
              type="button"
              onClick={() => openDeck(deck)}
              className="rounded-xl border p-4 text-left transition-colors hover:bg-muted/50"
            >
              <p className="font-medium">{deck.name}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
