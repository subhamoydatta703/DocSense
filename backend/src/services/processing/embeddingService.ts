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
    const values = response.embeddings?.[0]?.values;
if (!values || values.length === 0) {
  throw new Error("Embedding API returned empty values");
}
return values;


    }catch(error){
        console.error("Error creating embeddings: ", error);
        throw error;
    }
}