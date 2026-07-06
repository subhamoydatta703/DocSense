// user ask questions -> function -> embedding of the quetion -> search those embeddings and return top 5 resuls from pgvector -> filter by distance ->if length==0 -> not enough info -> else -> ai call(call answerGenerationService.ts file's answerQuery() function to answer) the question-> result
import { createEmbeddings } from "../processing/embeddingService"
import { searchSimilarVectors } from "../vectors/vectorService";
import { answerQuery } from "./answerGenerationService";
// import { createChunks } from "../processing/chunkService"
export const userQueryService = async (userQuery: string, userId:string, documentId?: string) => {

    try {
        // 1. get embedding of user query
        const embeddedQuery = await createEmbeddings(userQuery);
        // 2. rawquery call and get top 5 similar chunks from db
        const relatedChunks = await searchSimilarVectors(embeddedQuery, userId, documentId) as any[];
        // console.log("relatedChunks from user query service", relatedChunks);
        for (let chunk of relatedChunks) {
            console.log(chunk);

        }

        // 3. filter by distance 
        const relevantChunks = relatedChunks.filter(r => r.distance <= 0.4);
        // 4. if length==0 -> not enough info -> else -> ai call(call answerGenerationService.ts file's answerQuery() function to answer) the question-> result
        if (relevantChunks.length === 0) {
            return "I don't have enough information to answer this question.";
        }
        // 5. ai call -> return result
        const answer = await answerQuery(userQuery, relevantChunks);
        return answer;

    } catch (error) {
        console.error("Error in user query service: ", error);
        throw error;
    }

}