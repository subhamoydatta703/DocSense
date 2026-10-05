export interface SourceCitation {
  id: number;
  chunkId: string;
  documentId: string;
  documentName: string;
  chunkIndex: number;
  sourceVersion: string;
  quote: string;
}
export interface QueryResponse { success: true; answer: string; citations: SourceCitation[]; abstained: boolean }

export function parseQueryResponse(value: unknown): QueryResponse {
  if (!value || typeof value !== 'object') throw new Error('The server returned an invalid answer.');
  const data = value as Partial<QueryResponse>;
  if (data.success !== true || typeof data.answer !== 'string' || !data.answer.trim() ||
      typeof data.abstained !== 'boolean' || !Array.isArray(data.citations)) throw new Error('The server returned an invalid answer.');
  const ids = new Set<number>();
  for (const citation of data.citations) {
    if (!citation || !Number.isInteger(citation.id) || citation.id < 1 || ids.has(citation.id) ||
        typeof citation.chunkId !== 'string' || !citation.chunkId || typeof citation.documentId !== 'string' ||
        typeof citation.documentName !== 'string' || !Number.isInteger(citation.chunkIndex) || citation.chunkIndex < 0 ||
        typeof citation.sourceVersion !== 'string' || typeof citation.quote !== 'string' || !citation.quote.trim()) {
      throw new Error('The server returned invalid source references.');
    }
    ids.add(citation.id);
  }
  if (!data.abstained && !data.citations.length) throw new Error('The answer has no supporting source references.');
  return data as QueryResponse;
}
