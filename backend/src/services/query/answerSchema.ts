import { z } from "zod";
import { createHash } from "node:crypto";
import type { RetrievedChunk } from "../vectors/vectorService";

export const INSUFFICIENT_INFORMATION = "I don't have enough information to answer this question.";
export interface Citation {
  id: number;
  chunkId: string;
  documentId: string;
  documentName: string;
  chunkIndex: number;
  sourceVersion: string;
  quote: string;
}
export interface QueryAnswer { answer: string; citations: Citation[]; abstained: boolean }
export const abstention = (): QueryAnswer => ({ answer: INSUFFICIENT_INFORMATION, citations: [], abstained: true });

const payloadSchema = z.object({
  abstained: z.boolean(),
  claims: z.array(z.object({
    text: z.string().trim().min(1).max(8000),
    evidence: z.array(z.object({ chunkId: z.string().min(1), quote: z.string().trim().min(1).max(2000) }).strict()).min(1).max(10),
  }).strict()).max(20),
}).strict();

export function answerJsonSchema(chunkIds: string[]) {
  return {
    type: "object", required: ["abstained", "claims"], additionalProperties: false,
    properties: {
      abstained: { type: "boolean" },
      claims: { type: "array", items: {
        type: "object", required: ["text", "evidence"], additionalProperties: false,
        properties: { text: { type: "string" }, evidence: { type: "array", items: {
          type: "object", required: ["chunkId", "quote"], additionalProperties: false,
          properties: { chunkId: { type: "string", enum: chunkIds }, quote: { type: "string" } },
        } } },
      } },
    },
  };
}

function numbers(text: string): string[] {
  return (text.match(/[+-]?\d+(?:[,.]\d+)*%?/g) ?? []).map(value => value.replaceAll(",", ""));
}

/** Citation/excerpt checks establish provenance, not semantic entailment. */
export function parseGroundedAnswer(text: string, chunks: RetrievedChunk[]): QueryAnswer {
  const payload = payloadSchema.parse(JSON.parse(text));
  if (payload.abstained) {
    if (payload.claims.length) throw new Error("AI returned contradictory abstention and claims.");
    return abstention();
  }
  if (!payload.claims.length) throw new Error("AI returned no supported claims.");
  const sources = new Map(chunks.map(chunk => [chunk.id, chunk]));
  const citations: Citation[] = [];
  const answer: string[] = [];
  for (const claim of payload.claims) {
    // Citation syntax is supplied by the server, never accepted from model text.
    if (/\[(?:Source|Chunk)\s+\d/i.test(claim.text)) return abstention();
    const references: number[] = [];
    for (const evidence of claim.evidence) {
      const chunk = sources.get(evidence.chunkId);
      if (!chunk || !chunk.content.includes(evidence.quote) || !/[\p{L}\p{N}]/u.test(evidence.quote)) return abstention();
      let citation = citations.find(item => item.chunkId === chunk.id && item.quote === evidence.quote);
      if (!citation) {
        citation = { id: citations.length + 1, chunkId: chunk.id, documentId: chunk.documentId,
          documentName: chunk.documentName, chunkIndex: chunk.chunkIndex,
          sourceVersion: createHash("sha256").update(chunk.sourceKey).digest("hex").slice(0, 16), quote: evidence.quote };
        citations.push(citation);
      }
      if (!references.includes(citation.id)) references.push(citation.id);
    }
    const evidenceNumbers = new Set(numbers(claim.evidence.map(item => item.quote).join(" ")));
    if (numbers(claim.text).some(value => !evidenceNumbers.has(value))) return abstention();
    answer.push(`${claim.text} [Source ${references.join(", ")}]`);
  }
  return { answer: answer.join("\n\n"), citations, abstained: false };
}
