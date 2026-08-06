import { extractText } from "@/lib/ocr";
import { generateFlashcards } from "@/lib/flashcard-generator";
import { createServiceClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  const userId = formData.get("userId") as string | null;
  const deckId = formData.get("deckId") as string | null;

  if (!file) {
    return Response.json({ error: "Missing file" }, { status: 400 });
  }

  try {
    // 1. Extract text via OCR
    const bytes = Buffer.from(await file.arrayBuffer());
    const extractedText = await extractText(bytes, file.type);

    if (!extractedText.trim()) {
      return Response.json({ error: "No text could be extracted from the file." }, { status: 422 });
    }

    // 2. Generate flashcards via Claude
    const cards = await generateFlashcards(extractedText);

    if (cards.length === 0) {
      return Response.json({ error: "No flashcards could be generated." }, { status: 422 });
    }

    // 3. Save to Supabase (only if user is authenticated)
    if (userId) {
      const supabase = createServiceClient();
      const rows = cards.map((card) => ({
        user_id: userId,
        front: card.front,
        back: card.back,
        source_filename: file.name,
        deck_id: deckId,
      }));

      const { error } = await supabase.from("flashcards").insert(rows);

      if (error) {
        console.error("Supabase insert error:", error);
        // Still return the flashcards even if save fails
      }
    }

    return Response.json({ flashcards: cards });
  } catch (error) {
    console.error("Processing error:", error);
    const message = error instanceof Error ? error.message : "Processing failed.";
    return Response.json({ error: message }, { status: 500 });
  }
}
