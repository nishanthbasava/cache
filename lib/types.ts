export interface Deck {
  id: string;
  user_id: string;
  name: string;
  created_at: string;
}

export interface Flashcard {
  id: string;
  user_id: string;
  front: string;
  back: string;
  source_filename: string | null;
  deck: string;
  deck_id: string | null;
  created_at: string;
}
