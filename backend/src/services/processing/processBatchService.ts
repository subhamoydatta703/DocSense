import { createEmbeddings } from "./embeddingService";
import { createVector } from "../vectors/vectorService";



/**
 * Processes chunks sequentially to avoid bursts and stop promptly after stale-source detection.
 */
export const processBatch = async (batch: Array<{ chunk: string; index: number }>, documentId: string, s3Key: string) => {
    try {
        for (const item of batch) {
                const vectorData = await createEmbeddings(item.chunk);
                await createVector(
                    documentId,
                    item.chunk,
                    item.index,
                    vectorData,
                    s3Key
                );
        }
    } catch (error) {
        console.error("Error in process batch service: ", error);
        throw error;
    }




}

