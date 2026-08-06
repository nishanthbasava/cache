import Anthropic from "@anthropic-ai/sdk";

export type CaptureMode = "deep-study" | "key-takeaways" | "remember-this";

const anthropic = new Anthropic();

const modePrompts: Record<CaptureMode, string> = {
  "deep-study": `You are a flashcard generator for deep study. Given the following text extracted via OCR, create detailed flashcards that thoroughly test understanding.

Rules:
- Create many detailed question/answer pairs covering definitions, formulas, processes, and nuances
- Break complex topics into multiple cards
- Include "why" and "how" questions, not just "what"
- The "front" is a question or prompt, the "back" is a detailed answer
- Ignore OCR artifacts or garbled text
- Return ONLY a JSON array of objects with "front" and "back" keys, no other text`,

  "key-takeaways": `You are a flashcard generator for capturing key takeaways. Given the following text extracted via OCR, create flashcards covering the main ideas and concepts.

Rules:
- Focus on the big picture — main ideas, key concepts, and important conclusions
- Keep answers concise but informative
- Typically 3-6 cards depending on content density
- The "front" is a question or prompt, the "back" is the answer
- Ignore OCR artifacts or garbled text
- Return ONLY a JSON array of objects with "front" and "back" keys, no other text`,

  "remember-this": `You are a flashcard generator for quick capture. Given the following text extracted via OCR, create 1-2 simple flashcards that capture the essence of what's shown.

Rules:
- Keep it simple — just capture the core idea or fact worth remembering
- 1-2 cards maximum
- Short, memorable answers
- The "front" is a question or prompt, the "back" is the answer
- Ignore OCR artifacts or garbled text
- Return ONLY a JSON array of objects with "front" and "back" keys, no other text`,
};

export async function generateFlashcards(
  extractedText: string,
  mode: CaptureMode = "key-takeaways"
): Promise<Array<{ front: string; back: string }>> {
  const message = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 4096,
    messages: [
      {
        role: "user",
        content: `${modePrompts[mode]}

Text:
${extractedText}`,
      },
    ],
  });

  const content = message.content[0];
  if (content.type !== "text") {
    throw new Error("Unexpected response from Claude.");
  }

  const jsonMatch = content.text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    throw new Error("Could not parse flashcards from response.");
  }

  return JSON.parse(jsonMatch[0]);
}
