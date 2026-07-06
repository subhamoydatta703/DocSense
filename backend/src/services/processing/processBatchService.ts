import { createEmbeddings } from "./embeddingService";
import { createVector } from "../vectors/vectorService";


export const processBatch = async (batch: any[], documentId: string) => {
    try {
        await Promise.all(
            batch.map(async (item) => {
                const vectorData = await createEmbeddings(item.chunk);
                await createVector(
                    documentId,
                    item.chunk,
                    item.index,
                    vectorData
                );
            })
        )
    } catch (error) {
        console.error("Error in process batch service: ", error);
        throw error;
    }




}

