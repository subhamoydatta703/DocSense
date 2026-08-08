// user ask questions -> function -> embedding of the quetion -> search those embeddings and return top 5 resuls from pgvector -> filter by distance ->if length==0 -> not enough info -> else -> ai call(call answerGenerationService.ts file's answerQuery() function to answer) the question-> result
import { createEmbeddings } from "../processing/embeddingService"
import { searchSimilarVectors } from "../vectors/vectorService";
import { answerQuery } from "./answerGenerationService";
import { optimizeQuery } from "./queryOptimizationService";
import { inputGuardrail } from "../../guardrails/input/inputGuard";
import { GuardrailError } from "../../errors/guardRailError";
import { outputGuardrail } from "../../guardrails/output/outputGuard";
// import { createChunks } from "../processing/chunkService"
export const userQueryService = async (userQuery: string, userId: string, documentId?: string) => {

    try {

        // guard against injection and other input guardrails
        const guardResult = await inputGuardrail(userQuery);
        if (!guardResult.safe) {
            throw new GuardrailError(
                guardResult.reason,
                guardResult.category
            );
        }
        // 0. call query optimization service and use it and thr retured value goes inside the next function calls
        const optimizedQuery = await optimizeQuery(userQuery);
        console.info("Query optimization completed");



        // 1. get embedding of user query
        const embeddedQuery = await createEmbeddings(optimizedQuery);
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
        const answer = await answerQuery(userQuery, relevantChunks);

        // 6. output guardrail
        const outputGuardResult = await outputGuardrail(answer as string);
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
