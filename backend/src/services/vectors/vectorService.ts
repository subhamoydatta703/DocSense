import { prisma } from "../../config/db";


//   Create a DocumentChunk with its embedding

export const createVector = async (
    documentId: string,
    content: string,
    chunkIndex: number,
    embedding: number[]
) => {
    await prisma.$executeRaw`
    INSERT INTO "DocumentChunk" (
      "documentId",
      "content",
      "chunkIndex",
      "embedding"
    )
    VALUES (
      ${documentId},
      ${content},
      ${chunkIndex},
      ${embedding}::vector
    );
  `;
};


//  * Get all chunks of a document

export const getVectorsByDocumentId = async (
    documentId: string
) => {
    const result = await prisma.$queryRaw`
    SELECT *
    FROM "DocumentChunk"
    WHERE "documentId" = ${documentId}
    ORDER BY "chunkIndex";
  `;

    return result;
};


//   Find similar chunks

export const searchSimilarVectors = async (
    embedding: number[],
    limit: number = 5
) => {
    const result = await prisma.$queryRaw`
    SELECT *,
           embedding <=> ${embedding}::vector AS distance
    FROM "DocumentChunk"
    ORDER BY distance ASC
    LIMIT ${limit};
  `;

    return result;
};


//   Update embedding of a chunk

export const updateVector = async (
    chunkId: string,
    embedding: number[]
) => {
    await prisma.$executeRaw`
    UPDATE "DocumentChunk"
    SET embedding = ${embedding}::vector
    WHERE id = ${chunkId};
  `;
};


//   Delete all chunks of a document

export const deleteVectorsByDocumentId = async (
    documentId: string
) => {
    await prisma.$executeRaw`
    DELETE FROM "DocumentChunk"
    WHERE "documentId" = ${documentId};
  `;
};