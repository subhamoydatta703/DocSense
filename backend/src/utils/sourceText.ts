import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { UnrecoverableError } from "bullmq";

export const MAX_SOURCE_CHARACTERS = 500_000;
export const MAX_SOURCE_CHUNKS = 1000;

export class SourceValidationError extends UnrecoverableError {
  constructor(message: string) { super(message); this.name = "SourceValidationError"; }
}

export function hasReadableText(text: string): boolean {
  const withoutMarkers = text.replace(/^\s*--\s*\d+\s+of\s+\d+\s*--\s*$/gm, "");
  return /[\p{L}\p{N}]/u.test(withoutMarkers);
}

export function assertReadableSource(text: string): void {
  if (!hasReadableText(text)) throw new SourceValidationError("No readable text was found. For scanned PDFs, upload an OCR text version.");
  if (text.length > MAX_SOURCE_CHARACTERS) throw new SourceValidationError("Extracted text exceeds the 500,000 character limit.");
}

/** The API preflight and worker use exactly the same splitter and limits. */
export async function splitSourceText(text: string): Promise<string[]> {
  assertReadableSource(text);
  const chunks = (await new RecursiveCharacterTextSplitter({ chunkSize: 1000, chunkOverlap: 200 }).splitText(text))
    .filter(hasReadableText);
  if (!chunks.length) throw new SourceValidationError("No readable text was found in the source.");
  if (chunks.length > MAX_SOURCE_CHUNKS) throw new SourceValidationError("This source produces too many text sections. Split it into smaller sources.");
  return chunks;
}
