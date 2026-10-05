BEGIN;
-- Reindex documents with duplicate positions from their stored source.
CREATE TEMP TABLE duplicate_chunk_documents ON COMMIT DROP AS
SELECT DISTINCT "documentId" FROM "DocumentChunk"
GROUP BY "documentId", "chunkIndex" HAVING count(*) > 1;
UPDATE "Document" SET status = 'PENDING', "updatedAt" = NOW()
WHERE id IN (SELECT "documentId" FROM duplicate_chunk_documents);
DELETE FROM "DocumentChunk"
WHERE "documentId" IN (SELECT "documentId" FROM duplicate_chunk_documents);
CREATE UNIQUE INDEX "DocumentChunk_documentId_chunkIndex_key"
ON "DocumentChunk"("documentId", "chunkIndex");
COMMIT;
