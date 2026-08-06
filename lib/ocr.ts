import Tesseract from "tesseract.js";
import { pdf } from "pdf-to-img";

export async function extractText(fileBytes: Buffer, mimeType: string): Promise<string> {
  if (mimeType === "application/pdf") {
    return extractTextFromPdf(fileBytes);
  }

  const { data } = await Tesseract.recognize(fileBytes, "eng");
  return data.text;
}

async function extractTextFromPdf(fileBytes: Buffer): Promise<string> {
  const pages: string[] = [];
  const document = await pdf(fileBytes, { scale: 2 });

  for await (const pageImage of document) {
    const { data } = await Tesseract.recognize(pageImage, "eng");
    pages.push(data.text);
  }

  return pages.join("\n\n");
}
