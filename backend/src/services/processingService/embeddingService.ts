import { GoogleGenAI } from "@google/genai";


// get embedding from chunk
export const createEmbeddings = async (chunk: string): Promise<number[]> => {
    try{
        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_EMBEDDING_API_KEY });

    const response = await ai.models.embedContent({
        model: 'gemini-embedding-2',
        contents: chunk,
        config: { outputDimensionality: 768 },
    });

    console.log(response.embeddings);
    return response.embeddings?.[0]?.values as number[] || [];

    }catch(error){
        console.error("Error creating embeddings: ", error);
        throw error;
    }
}