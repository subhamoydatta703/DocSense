import { createChunks } from "./chunkService";
import { prisma } from "../../config/db/db";
import { processBatch } from "./processBatchService";
import { StaleDocumentError } from "../../errors/staleDocumentError";
import { UnrecoverableError } from "bullmq";

/**
 * Orchestrates the full document processing pipeline: status updates, chunking, batch embedding, and vector storage.
 */
export const processDocumentService = async (documentId: string, expectedS3Key: string) => {
    try {
        const source = await prisma.document.findUnique({ where: { id: documentId } });
        if (!source || source.s3Key !== expectedS3Key) throw new StaleDocumentError();
        const claimed = await prisma.document.updateMany({ where: { id: documentId, s3Key: expectedS3Key }, data: { status: "PROCESSING" } });
        if (!claimed.count) throw new StaleDocumentError();

        const chunks = await createChunks(documentId, source);
        if (!chunks.length) throw new UnrecoverableError("No readable text was found in the document.");

        if (chunks.length > 500) {
            throw new UnrecoverableError(
                "Document is too large."
            );
        }

        const batch = [];

        for (const [index, chunk] of chunks.entries()) {
            batch.push({ chunk, index });
            if (batch.length === 5) {
                await processBatch(batch, documentId, expectedS3Key);
                batch.length = 0;
            }
        }

        if (batch.length > 0) {
            await processBatch(batch, documentId, expectedS3Key);
        }

        await prisma.document.updateMany({
            where: { id: documentId, s3Key: expectedS3Key },
            data: {
                status: "COMPLETED",
            },
        });
    } catch (error) {
        console.error("Error in processDocumentService: ", error);
        throw error;
    }
};
