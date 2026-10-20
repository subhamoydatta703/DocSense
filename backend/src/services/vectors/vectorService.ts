import { prisma } from "../../config/db/db";
import { randomUUID } from "crypto";
import { StaleDocumentError } from "../../errors/staleDocumentError";
import { hasReadableText } from "../../utils/sourceText";
import { ServiceError } from "../../errors/serviceError";

export interface RetrievedChunk {
  id: string;
  documentId: string;
  chunkIndex: number;
  sourceKey: string;
  content: string;
  documentName: string;
  distance: number;
}

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
  limit: number = 5,
  signal?: AbortSignal,
) => {
  const vectorStr = `[${embedding.join(",")}]`;
  const pageSize = Math.max(50, limit);
  const readableChunks: RetrievedChunk[] = [];
  // Page through candidates rather than allowing blank legacy entries to consume
  // the usable-context limit. The cap makes a badly damaged index fail explicitly.
  for (let page = 0; page < 20; page++) {
    signal?.throwIfAborted();
    const offset = page * pageSize;
    const candidates = documentId ? await prisma.$queryRaw<RetrievedChunk[]>`
      SELECT dc.id, dc."documentId", dc.content, dc."chunkIndex", d."originalName" AS "documentName", d."s3Key" AS "sourceKey",
             dc.embedding <=> ${vectorStr}::vector AS distance
      FROM "DocumentChunk" dc
      JOIN "Document" d ON dc."documentId" = d.id
      WHERE d."userId" = ${userId} AND d.id = ${documentId} AND d.status = 'COMPLETED'
        AND (dc.embedding <=> ${vectorStr}::vector) <= 0.4
      ORDER BY distance ASC, dc.id
      LIMIT ${pageSize} OFFSET ${offset};
    ` : await prisma.$queryRaw<RetrievedChunk[]>`
      WITH ranked_chunks AS (
        SELECT dc.id, dc."documentId", dc.content, dc."chunkIndex",
          d."originalName" AS "documentName", d."s3Key" AS "sourceKey",
          dc.embedding <=> ${vectorStr}::vector AS distance,
          ROW_NUMBER() OVER (PARTITION BY d.id ORDER BY dc.embedding <=> ${vectorStr}::vector, dc.id) AS source_rank
        FROM "DocumentChunk" dc JOIN "Document" d ON dc."documentId" = d.id
        WHERE d."userId" = ${userId} AND d.status = 'COMPLETED'
          AND (dc.embedding <=> ${vectorStr}::vector) <= 0.4
      )
      SELECT id, "documentId", content, "chunkIndex", "documentName", "sourceKey", distance
      FROM ranked_chunks ORDER BY source_rank, distance, id
      LIMIT ${pageSize} OFFSET ${offset};
    `;
    for (const candidate of candidates) {
      if (Number.isFinite(candidate.distance) && candidate.distance <= 0.4 && hasReadableText(candidate.content)) {
        readableChunks.push(candidate);
        if (readableChunks.length === limit) return readableChunks;
      }
    }
    if (candidates.length < pageSize) return readableChunks;
  }
  throw new ServiceError(409, "Too many unusable index entries were encountered. Reprocess unreadable sources before asking again.", "retrieval");
};


//   Update embedding of a chunk

/** Complete ordered context for a short-document summary, always owner scoped. */
export const getSummaryChunks = (userId: string, documentId?: string) => prisma.$queryRaw<RetrievedChunk[]>`
  SELECT dc.id, dc."documentId", dc.content, dc."chunkIndex", d."originalName" AS "documentName",
         d."s3Key" AS "sourceKey", 0::double precision AS distance
  FROM "DocumentChunk" dc JOIN "Document" d ON dc."documentId" = d.id
  WHERE d."userId" = ${userId} AND d.status = 'COMPLETED'
    AND (${documentId ?? null}::text IS NULL OR d.id = ${documentId ?? null}::text)
  ORDER BY d.id, dc."chunkIndex" LIMIT 31;
`;

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
