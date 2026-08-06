import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic();

export async function generateFlashcards(
  extractedText: string
): Promise<Array<{ front: string; back: string }>> {
  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4096,
    messages: [
      {
        role: "user",
        content: `You are a flashcard generator. Given the following text extracted via OCR, create useful study flashcards as question/answer pairs.

Rules:
- Create concise, clear flashcards that test understanding
- The "front" is a question or prompt, the "back" is the answer
- Focus on key concepts, definitions, and important facts
- Ignore OCR artifacts or garbled text
- Return ONLY a JSON array of objects with "front" and "back" keys, no other text

Text:
${extractedText}`,
      },
    ],
  });

  const content = message.content[0];
  if (content.type !== "text") {
    throw new Error("Unexpected response from Claude.");
  }

  // Extract JSON from the response (Claude may wrap it in markdown code blocks)
  const jsonMatch = content.text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    throw new Error("Could not parse flashcards from response.");
  }

  return JSON.parse(jsonMatch[0]);
}
