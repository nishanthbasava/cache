export interface Flashcard {
  id: string;
  user_id: string;
  front: string;
  back: string;
  source_filename: string | null;
  deck: string;
  created_at: string;
}
