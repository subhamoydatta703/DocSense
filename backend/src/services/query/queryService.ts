import { createEmbeddings } from "../processing/embeddingService";
import { searchSimilarVectors } from "../vectors/vectorService";
import { answerQuery } from "./answerGenerationService";
import { optimizeQuery } from "./queryOptimizationService";
import { inputGuardrail } from "../../guardrails/input/inputGuard";
import { GuardrailError } from "../../errors/guardRailError";
import { outputGuardrail } from "../../guardrails/output/outputGuard";
import { prisma } from "../../config/db/db";
import { ServiceError, runQueryStage } from "../../errors/serviceError";

/**
 * Executes RAG pipeline: input guardrail, query optimization, embedding, pgvector search, answer generation, and output guardrail.
 */
export const userQueryService = async (userQuery: string, userId: string, documentId?: string, signal?: AbortSignal) => {
    try {
        if (documentId) {
            const document = await prisma.document.findFirst({ where: { id: documentId, userId }, select: { status: true } });
            if (!document) throw new ServiceError(404, "Document not found.");
            if (document.status !== "COMPLETED") throw new ServiceError(409, "This document is not ready for questions yet. Please check its processing status.");
        }
        const guardResult = await runQueryStage("input_guard", () => inputGuardrail(userQuery, signal));
        if (!guardResult.safe) {
            throw new GuardrailError(
                guardResult.reason,
                guardResult.category
            );
        }

        // Query rewriting is an enhancement; an outage should still allow original-query retrieval.
        let optimizedQuery = userQuery;
        try { optimizedQuery = await runQueryStage("query_optimization", () => optimizeQuery(userQuery, signal)); }
        catch (error) { if (signal?.aborted) throw error; console.warn("Using original query after optimization failure"); }



        // 1. get embedding of user query
        const embeddedQuery = await runQueryStage("embedding", () => createEmbeddings(optimizedQuery, signal));
        // 2. rawquery call and get top 5 similar chunks from db
        const relatedChunks = await searchSimilarVectors(embeddedQuery, userId, documentId) as any[];
        console.info("Vector search completed", { resultCount: relatedChunks.length });

        // 3. filter by distance 
        const relevantChunks = relatedChunks.filter(r => r.distance <= 0.4);
        // 4. if length==0 -> not enough info -> else -> ai call(call answerGenerationService.ts file's answerQuery() function to answer) the question-> result
        if (relevantChunks.length === 0) {
            return "I don't have enough information to answer this question.";
        }
        // 5. ai call -> return result
        const answer = await runQueryStage("answer_generation", () => answerQuery(userQuery, relevantChunks, signal));

        // 6. output guardrail
        const outputGuardResult = await runQueryStage("output_guard", () => outputGuardrail(answer, signal));
        if (!outputGuardResult.safe) {
            throw new GuardrailError(
                outputGuardResult.reason,
                outputGuardResult.category
            );
        }

        return answer;

    } catch (error) {
        
        console.error("Error in user query service: ", error);
        throw error;
    }

}
