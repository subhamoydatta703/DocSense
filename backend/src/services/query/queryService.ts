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
import { asksAboutSelectedSource, needsCompleteContext } from "./queryIntent";

const fitsCompleteContext = (chunks: RetrievedChunk[]) => chunks.length <= 30 &&
  chunks.reduce((total, chunk) => total + chunk.content.length, 0) <= 30_000;

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
  const summarizing = needsCompleteContext(query);
  const sourceOverview = Boolean(documentId) && asksAboutSelectedSource(query);
  let completeContext = summarizing;
  let expectedLibrarySources: Array<{ id: string; s3Key: string }> | undefined;
  let chunks: RetrievedChunk[];
  if (sourceOverview) {
    // A vague source question has no useful embedding keywords. Read the opening
    // sections directly, keeping a bounded excerpt for long sources.
    const opening = await runQueryStage("retrieval", () => getSummaryChunks(userId, documentId), signal);
    completeContext = fitsCompleteContext(opening);
    chunks = completeContext ? opening : opening.slice(0, 8);
  } else if (summarizing) {
    if (!documentId) {
      expectedLibrarySources = await runQueryStage("retrieval", () => prisma.document.findMany({
        where: { userId, status: "COMPLETED" }, select: { id: true, s3Key: true },
      }), signal);
    }
    chunks = await runQueryStage("retrieval", () => getSummaryChunks(userId, documentId), signal);
    if (!fitsCompleteContext(chunks)) {
      const scope = documentId ? "This document is" : "Your ready sources are";
      return { answer: `${scope} too long for a complete summary or comparison in one request. Select a source or ask about a specific section or topic.`, citations: [], abstained: true };
    }
    if (expectedLibrarySources?.some(source => !chunks.some(chunk => chunk.documentId === source.id && hasReadableText(chunk.content)))) {
      return { answer: "Some ready sources have no readable indexed text. Reprocess those sources or select a source before requesting a complete library answer.", citations: [], abstained: true };
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
    chunks = await runQueryStage("retrieval", () => searchSimilarVectors(embedding, userId, documentId, 5, signal), signal);
  }
  let relevant = chunks.filter(chunk => Number.isFinite(chunk.distance) && hasReadableText(chunk.content));
  if (!summarizing && !sourceOverview) {
    const closest = relevant.filter(chunk => chunk.distance <= 0.4);
    if (closest.length) relevant = closest;
  }
  console.info("Source retrieval completed", { resultCount: chunks.length, readableCount: relevant.length, sourceOverview });
  let answer = relevant.length
    ? await runQueryStage("answer_generation", () => generateGroundedAnswer(query, relevant, signal, completeContext), signal)
    : abstention();
  if (answer.abstained && documentId && !completeContext && !sourceOverview) {
    // Retrieval can miss an answer phrased differently or split across chunks.
    // Retry once with the complete selected source only when it fits the budget.
    const fullSource = await runQueryStage("retrieval_recovery", () => getSummaryChunks(userId, documentId), signal);
    const readable = fullSource.filter(chunk => hasReadableText(chunk.content));
    if (!readable.length) throw new ServiceError(409, "This source has no readable indexed text. Reprocess it before asking questions.", "retrieval");
    if (fitsCompleteContext(fullSource) && readable.some(chunk => !relevant.some(selected => selected.id === chunk.id))) {
      relevant = readable;
      completeContext = true;
      answer = await runQueryStage("answer_recovery", () => generateGroundedAnswer(query, relevant, signal, true), signal);
    }
  }
  if (answer.abstained) {
    console.info("Answer withheld", { stage: relevant.length ? "answer_evidence" : "retrieval", contextCount: relevant.length });
    return answer;
  }
  // Quotes and source names are also part of the content released to the browser.
  const output = await runQueryStage("output_guard", () => outputGuardrail(JSON.stringify(answer), signal), signal);
  if (output.category === "UNSUPPORTED_CLAIM") {
    console.info("Answer withheld", { stage: "output_evidence", contextCount: relevant.length });
    return abstention();
  }
  if (!output.safe) throw new GuardrailError(output.reason, output.category);
  await runQueryStage("source_validation", async () => {
    const documents = await prisma.document.findMany({
      where: expectedLibrarySources
        ? { userId, status: "COMPLETED" }
        : { userId, id: { in: [...new Set(relevant.map(chunk => chunk.documentId))] } },
      select: { id: true, status: true, s3Key: true },
    });
    if (expectedLibrarySources && (documents.length !== expectedLibrarySources.length ||
        expectedLibrarySources.some(source => !documents.some(current => current.id === source.id && current.s3Key === source.s3Key)))) {
      throw new ServiceError(409, "Your ready sources changed while answering. Please ask again.", "source_validation");
    }
    for (const chunk of relevant) {
      const current = documents.find(document => document.id === chunk.documentId);
      if (!current || current.status !== "COMPLETED" || current.s3Key !== chunk.sourceKey) {
        throw new ServiceError(409, "The source changed while answering. Please ask again after processing finishes.", "source_validation");
      }
    }
  }, signal);
  return {
    ...answer,
    coverage: completeContext
      ? documentId ? "Uses the complete indexed text of this source." : "Uses the complete indexed text of all ready sources."
      : sourceOverview ? "Uses the opening sections of this source; later sections may not be covered."
        : "Uses selected matching passages; other sections, sources, or exceptions may not be covered.",
  };
};

/** Keep the text-only service interface for internal callers. */
export const userQueryService = async (query: string, userId: string, documentId?: string, signal?: AbortSignal) =>
  (await userQueryWithEvidence(query, userId, documentId, signal)).answer;
