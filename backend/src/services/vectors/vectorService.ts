import { prisma } from "../../config/db/db";
import { randomUUID } from "crypto";
import { StaleDocumentError } from "../../errors/staleDocumentError";

//   Create a DocumentChunk with its embedding

/**
 * Inserts a document chunk and its 768-dimension vector embedding into pgvector using raw SQL.
 */
export const createVector = async (

  documentId: string,
  content: string,
  chunkIndex: number,
  embedding: number[],
  expectedS3Key: string
) => {

  const id = randomUUID();
  const vectorStr = `[${embedding.join(",")}]`;

  await prisma.$transaction(async tx => {
    const current = await tx.$queryRaw<Array<{ s3Key: string }>>`
      SELECT "s3Key" FROM "Document" WHERE id = ${documentId} FOR UPDATE
    `;
    if (current[0]?.s3Key !== expectedS3Key) throw new StaleDocumentError();
    await tx.$executeRaw`
    INSERT INTO "DocumentChunk" (
      "id",
      "documentId",
      "content",
      "chunkIndex",
      "embedding"
    )
    VALUES (
    ${id},
      ${documentId},
      ${content},
      ${chunkIndex},
      ${vectorStr}::vector
    ) ON CONFLICT ("documentId", "chunkIndex") DO UPDATE
    SET content = EXCLUDED.content, embedding = EXCLUDED.embedding;
  `;
  }, { maxWait: 10_000, timeout: 10_000 });
};


//   Get all chunks of a document

/**
 * Retrieves all vector chunks belonging to a document ordered by chunk index.
 */
export const getVectorsByDocumentId = async (
  documentId: string
) => {
  const result = await prisma.$queryRaw`
    SELECT "id", "documentId", "content", "chunkIndex", "createdAt", embedding::text AS embedding
    FROM "DocumentChunk"
    WHERE "documentId" = ${documentId}
    ORDER BY "chunkIndex";
  `;

  return result;
};


//   Find similar chunks

/**
 * Performs cosine distance similarity search (<=>) in pgvector for the top matching document chunks.
 */
export const searchSimilarVectors = async (
  embedding: number[],
  userId: string,
  documentId?: string,
  limit: number = 5
) => {
  const vectorStr = `[${embedding.join(",")}]`;
  if (documentId) {
    return await prisma.$queryRaw`
      SELECT dc.id, dc."documentId", dc.content, dc."chunkIndex", d."originalName" AS "documentName",
             dc.embedding <=> ${vectorStr}::vector AS distance
      FROM "DocumentChunk" dc
      JOIN "Document" d ON dc."documentId" = d.id
      WHERE d."userId" = ${userId} AND d.id = ${documentId} AND d.status = 'COMPLETED'
      ORDER BY distance ASC
      LIMIT ${limit};
    `;
  }
  return await prisma.$queryRaw`
    SELECT dc.id, dc."documentId", dc.content, dc."chunkIndex", d."originalName" AS "documentName",
           dc.embedding <=> ${vectorStr}::vector AS distance
    FROM "DocumentChunk" dc
    JOIN "Document" d ON dc."documentId" = d.id
    WHERE d."userId" = ${userId} AND d.status = 'COMPLETED'
    ORDER BY distance ASC
    LIMIT ${limit};
  `;
};


//   Update embedding of a chunk

/**
 * Updates the vector embedding of an existing document chunk.
 */
export const updateVector = async (
  chunkId: string,
  embedding: number[]
) => {
  const vectorStr = `[${embedding.join(",")}]`;
  await prisma.$executeRaw`
    UPDATE "DocumentChunk"
    SET embedding = ${vectorStr}::vector
    WHERE id = ${chunkId};
  `;
};


//   Delete all chunks of a document

/**
 * Deletes all vector chunks associated with a document ID.
 */
export const deleteVectorsByDocumentId = async (
  documentId: string
) => {
  await prisma.$executeRaw`
    DELETE FROM "DocumentChunk"
    WHERE "documentId" = ${documentId};
  `;
};
