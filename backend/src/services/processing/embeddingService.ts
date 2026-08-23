import { aiEmbedding } from "../../config/ai/ai";


/**
 * Generates 768-dimensional vector embeddings for a text chunk using Gemini embedding model.
 */
export const createEmbeddings = async (chunk: string): Promise<number[]> => {
    try{
       

    const response = await aiEmbedding.models.embedContent({
        model: 'gemini-embedding-2',
        contents: chunk,
        config: { outputDimensionality: 768 },
    });

    const values = response.embeddings?.[0]?.values;
if (!values || values.length === 0) {
  throw new Error("Embedding API returned empty values");
}
console.info("Embedding created", { dimensions: values.length });
return values;


    }catch(error){
        console.error("Error creating embeddings: ", error);
        throw error;
    }
}
