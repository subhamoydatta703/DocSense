import { PDFParse } from 'pdf-parse';

export async function extractPDFText(dataBuffer: Buffer): Promise<string> {
  let parser;
  try {
    // Instantiate using v2 structure
    parser = new PDFParse({ data: dataBuffer });
    const result = await parser.getText();
    
    console.log('--- Parsed PDF Text ---');
    console.log(result.text);
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