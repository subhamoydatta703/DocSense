import { ai } from "../../config/ai/ai";
interface RetrievedChunk {
    id: string;
    content: string;
    documentName: string;
    distance: number;
}

export const answerQuery = async (userQuestion: string, chunks: RetrievedChunk[]) => {
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

Answer clearly and cite which chunk(s) you used (e.g. "According to Chunk 2...").`;


        const response = await ai.models.generateContent({
            model: "gemini-3.1-flash-lite",
            contents: prompt,
        });

        return response.text;

    } catch (error) {
        console.error("Error in answer generation service: ", error);
        throw error;
    }

}