import { createChunks } from "./chunkService";
import { prisma } from "../../config/db/db";
import { processBatch } from "./processBatchService";

/**
 * Orchestrates the full document processing pipeline: status updates, chunking, batch embedding, and vector storage.
 */
export const processDocumentService = async (documentId: string) => {
    try {
        await prisma.document.update({
            where: { id: documentId },
            data: {
                status: "PROCESSING",
            },
        });

        const chunks = await createChunks(documentId);

        if (chunks.length > 500) {
            throw new Error(
                "Document is too large."
            );
        }

        const batch = [];

        for (const [index, chunk] of chunks.entries()) {
            batch.push({ chunk, index });
            if (batch.length === 5) {
                await processBatch(batch, documentId);
                batch.length = 0;
            }
        }

        if (batch.length > 0) {
            await processBatch(batch, documentId);
        }

        await prisma.document.update({
            where: { id: documentId },
            data: {
                status: "COMPLETED",
            },
        });
    } catch (error) {
        console.error("Error in processDocumentService: ", error);
        throw error;
    }
};