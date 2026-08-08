import { PDFParse } from 'pdf-parse';

export async function extractPDFText(dataBuffer: Buffer): Promise<string> {
  let parser;
  try {
    // Instantiate using v2 structure
    parser = new PDFParse({ data: dataBuffer });

    // Get PDF metadata
    const info = await parser.getInfo();

    console.log("Pages:", info.total);

    if (info.total > 100) {
      throw new Error("PDF cannot have more than 100 pages.");
    }

    const result = await parser.getText();

    console.info("PDF text extracted", { characters: result.text.length });

    return result.text;

  } catch (error) {
    console.error('Error parsing PDF:', error);
    throw error;
  } finally {
    if (parser) {
      await parser.destroy();
    }
  }
}
