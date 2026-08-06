import FlashcardDeck from "@/components/FlashcardDeck";

export default function StudyPage() {
  return (
    <main className="mx-auto w-full max-w-md p-6">
      <h1 className="font-heading mb-6 text-2xl font-bold">Study</h1>
      <FlashcardDeck />
    </main>
  );
}
