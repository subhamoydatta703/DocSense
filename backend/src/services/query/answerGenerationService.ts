import { ai } from "../../config/ai/ai";
import { retryAiRequest } from "../../utils/aiRetry";
interface RetrievedChunk {
    id: string;
    content: string;
    documentName: string;
    distance: number;
}

/**
 * Generates a grounded, cited answer using Gemini based strictly on retrieved context chunks.
 */
export const answerQuery = async (userQuestion: string, chunks: RetrievedChunk[], signal?: AbortSignal) => {
    try {
        const context = chunks
            .map((c, i) => `[Chunk ${i + 1} - Source: ${c.documentName}]\n${c.content}`)
            .join("\n\n---\n\n");


        const prompt = `You are answering a question using ONLY the context provided below. 
If the answer isn't in the context, say you don't have enough information — do not make things up.

CONTEXT:
${context}

QUESTION:
${userQuestion}

Answer directly and cite which chunk(s) you used (e.g. "According to Chunk 2...").
Keep the answer concise, usually within 150 words, unless the question explicitly requests more detail.
Include the facts needed to answer the question; avoid repeating the question or adding an introduction.`;


        // Both attempts and backoff share one deadline; retries cannot extend it.
        const requestSignal = AbortSignal.any([AbortSignal.timeout(35_000), ...(signal ? [signal] : [])]);
        const response = await retryAiRequest(() => ai.models.generateContent({
            model: "gemini-3.8-flash",
            contents: prompt,
            config: {
                maxOutputTokens: 2048,
                abortSignal: requestSignal,
            },
        }), requestSignal);

        const answer = response.text?.trim();
        if (!answer) throw new Error("AI returned an empty answer.");
        return answer;

    } catch (error) {
        console.error("Error in answer generation service: ", error);
        throw error;
    }

}
