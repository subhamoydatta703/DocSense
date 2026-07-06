import { aiEmbedding } from "../../config/ai/ai";


// get embedding from chunk
export const createEmbeddings = async (chunk: string): Promise<number[]> => {
    try{
       

    const response = await aiEmbedding.models.embedContent({
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