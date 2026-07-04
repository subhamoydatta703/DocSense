// call other processingService files and create vectors by embedding and save it to the db
// it is an orchestrator 

import { createChunks } from "./chunkService";
import { createEmbeddings } from "./embeddingService";
import { prisma } from "../../config/db";
import { createVector } from "../vectors/vectorService";


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

        // 3. embedding & store vectors in db
        for (const [index, chunk] of chunks.entries()) {
            const vectorData = await createEmbeddings(chunk);

            await createVector(
                documentId,
                chunk,
                index,
                vectorData
            );
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