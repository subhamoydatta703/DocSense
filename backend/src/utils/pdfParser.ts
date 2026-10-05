import { PDFParse, InvalidPDFException, FormatError, PasswordException } from 'pdf-parse';
import { assertReadableSource, SourceValidationError } from './sourceText';

/**
 * Parses PDF buffer and extracts text content, enforcing a maximum 100-page limit.
 */
export async function extractPDFText(dataBuffer: Buffer): Promise<string> {
  let parser;
  try {
    // Instantiate using v2 structure
    parser = new PDFParse({ data: dataBuffer });

    // Get PDF metadata
    const info = await parser.getInfo();

    if (info.total > 100) {
      throw new SourceValidationError("PDF cannot have more than 100 pages.");
    }

    const result = await parser.getText({ pageJoiner: "" });
    // Per-page text excludes synthetic page markers in the combined result.
    const text = result.pages.map(page => page.text.trim()).filter(Boolean).join("\n\n");
    assertReadableSource(text);

    console.info("PDF text extracted", { characters: text.length, pages: result.total });

    return text;

  } catch (error) {
    console.error('PDF extraction failed', { errorType: error instanceof Error ? error.name : 'UnknownError' });
    if (error instanceof PasswordException) throw new SourceValidationError("The PDF is password protected. Upload an unlocked copy.");
    if (error instanceof InvalidPDFException || error instanceof FormatError) throw new SourceValidationError("The PDF could not be read. Upload a valid, undamaged PDF.");
    throw error;
  } finally {
    if (parser) {
      await parser.destroy();
    }
  }
}
