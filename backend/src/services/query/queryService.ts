import { createEmbeddings } from "../processing/embeddingService";
import { searchSimilarVectors, getSummaryChunks, type RetrievedChunk } from "../vectors/vectorService";
import { generateGroundedAnswer } from "./answerGenerationService";
import { abstention, type QueryAnswer } from "./answerSchema";
import { hasReadableText } from "../../utils/sourceText";
import { optimizeQuery } from "./queryOptimizationService";
import { inputGuardrail } from "../../guardrails/input/inputGuard";
import { outputGuardrail } from "../../guardrails/output/outputGuard";
import { GuardrailError } from "../../errors/guardRailError";
import { ServiceError, runQueryStage } from "../../errors/serviceError";
import { prisma } from "../../config/db/db";
import { queryPolicy } from "../../config/ai/policy";

export const userQueryWithEvidence = async (query: string, userId: string, documentId?: string, signal?: AbortSignal): Promise<QueryAnswer> => {
  if (documentId) {
    const document = await runQueryStage("document_readiness", () => prisma.document.findFirst({
      where: { id: documentId, userId }, select: { status: true },
    }), signal);
    if (!document) throw new ServiceError(404, "Document not found.", "document_readiness");
    if (document.status !== "COMPLETED") throw new ServiceError(409, "This document is not ready for questions yet. Please check its processing status.", "document_readiness");
  }
  const guard = await runQueryStage("input_guard", () => inputGuardrail(query, signal), signal);
  if (!guard.safe) throw new GuardrailError(guard.reason, guard.category);
  const summarizing = Boolean(documentId
    && /\b(summar(?:y|ize|ise)|overview|key (?:points|takeaways))\b/i.test(query)
    && !/\b(section|clause|chapter|paragraph|page|topic)\b/i.test(query));
  let chunks: RetrievedChunk[];
  if (summarizing && documentId) {
    chunks = await runQueryStage("retrieval", () => getSummaryChunks(userId, documentId), signal);
    if (chunks.length > 30 || chunks.reduce((total, chunk) => total + chunk.content.length, 0) > 30_000) {
      return { answer: "This document is too long for a complete summary in one request. Ask about a specific section or topic.", citations: [], abstained: true };
    }
  } else {
    let retrievalQuery = query;
    if (queryPolicy.rewriteEnabled) {
      try {
        retrievalQuery = await runQueryStage("query_optimization", () => optimizeQuery(query, signal), signal);
      } catch (error) {
        if (signal?.aborted) throw error;
        console.warn("Using original question after optimization failure");
      }
    }
    const embedding = await runQueryStage("embedding", () => createEmbeddings(retrievalQuery, signal, "interactive"), signal);
    chunks = await runQueryStage("retrieval", () => searchSimilarVectors(embedding, userId, documentId), signal);
  }
  const relevant = chunks.filter(chunk => Number.isFinite(chunk.distance) && chunk.distance <= 0.4 && hasReadableText(chunk.content));
  console.info("Vector search completed", { resultCount: chunks.length, relevantCount: relevant.length });
  if (!relevant.length) return abstention();
  const answer = await runQueryStage("answer_generation", () => generateGroundedAnswer(query, relevant, signal), signal);
  if (answer.abstained) return answer;
  // Quotes and source names are also part of the content released to the browser.
  const output = await runQueryStage("output_guard", () => outputGuardrail(JSON.stringify(answer), signal), signal);
  if (output.category === "UNSUPPORTED_CLAIM") return abstention();
  if (!output.safe) throw new GuardrailError(output.reason, output.category);
  await runQueryStage("source_validation", async () => {
    const documents = await prisma.document.findMany({
      where: { userId, id: { in: [...new Set(relevant.map(chunk => chunk.documentId))] } },
      select: { id: true, status: true, s3Key: true },
    });
    for (const chunk of relevant) {
      const current = documents.find(document => document.id === chunk.documentId);
      if (!current || current.status !== "COMPLETED" || current.s3Key !== chunk.sourceKey) {
        throw new ServiceError(409, "The source changed while answering. Please ask again after processing finishes.", "source_validation");
      }
    }
  }, signal);
  return answer;
};

/** Keep the text-only service interface for internal callers. */
export const userQueryService = async (query: string, userId: string, documentId?: string, signal?: AbortSignal) =>
  (await userQueryWithEvidence(query, userId, documentId, signal)).answer;
