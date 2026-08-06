import Tesseract from "tesseract.js";

export async function extractText(fileBytes: Buffer, mimeType: string): Promise<string> {
  // Tesseract expects image formats — for PDFs we'd need to convert pages to images first.
  // For now, this handles image uploads (JPEG, PNG, etc.) directly.
  if (mimeType === "application/pdf") {
    throw new Error("PDF OCR is not yet supported. Please upload an image.");
  }

  const { data } = await Tesseract.recognize(fileBytes, "eng");
  return data.text;
}
