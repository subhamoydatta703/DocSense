// call other processingService files and create vectors by embedding and save it to the db
// it is an orchestrator 

import { createChunks } from "./chunkService";
import { prisma } from "../../config/db/db";
import { processBatch } from "./processBatchService";


export const processDocumentService = async (documentId: string) => {
    try {
        // 1. Parse data and return string
        // already happend inside chunkService.ts by calling getParsedData() of getDataService.ts

        await prisma.document.update({
            where: { id: documentId },
            data: {
                status: "PROCESSING",
            },
        });

        // 2. chunk
        const chunks = await createChunks(documentId)

        // limit chunks
        if (chunks.length > 500) {
            throw new Error(
                "Document is too large."
            );
        }

        // 3. embedding & store vectors in db by using batch where 5 chunks are embedded at the same time: it is more optimized way
        const batch = []

        for (const [index, chunk] of chunks.entries()) {
            batch.push({ chunk, index });
            if (batch.length === 5) {
                await processBatch(batch, documentId)

                batch.length = 0;
            }
        }

        if (batch.length > 0) {
            await processBatch(batch, documentId)

        }

        // 4. update document status to complete
        await prisma.document.update({
            where: { id: documentId },
            data: {
                status: "COMPLETED",
            },
        });
    } catch (error) {

        // 5. update document status to failed
        await prisma.document.update({
            where: { id: documentId },
            data: {
                status: "FAILED",
            },
        });
        console.error("Error in processDocumentService: ", error)
        throw error
    }



}