import { prisma } from "../../config/db/db";
import type { Document } from "../../../prisma/generated/client";
import { ServiceError } from "../../errors/serviceError";
import { hasReadableText } from "../../utils/sourceText";
import { deleteFile } from "../storage/s3storageService";

export interface DocumentReplacement {
  documentId: string;
  replacementId: string;
  expectedSourceKey: string;
  expectedReplacementKey: string;
}

/**
 * Upload and index the replacement as a separate source first. This transaction
 * activates it only after both source versions have been checked under row locks.
 */
export async function replaceDocumentService(userId: string, request: DocumentReplacement) {
  if (request.documentId === request.replacementId) {
    throw new ServiceError(400, "Choose a different source as the replacement.");
  }

  const result = await prisma.$transaction(async transaction => {
    // Lock in a consistent order so concurrent requests replacing sources in
    // opposite directions cannot deadlock. Only the owner's rows are visible.
    const documents = await transaction.$queryRaw<Document[]>`
      SELECT * FROM "Document"
      WHERE "userId" = ${userId}
        AND id IN (${request.documentId}, ${request.replacementId})
      ORDER BY id FOR UPDATE
    `;
    const currentSource = documents.find(document => document.id === request.documentId);
    const replacementSource = documents.find(document => document.id === request.replacementId);

    if (!currentSource || !replacementSource) {
      throw new ServiceError(404, "One of the selected sources is no longer available.");
    }
    if (currentSource.s3Key !== request.expectedSourceKey ||
        replacementSource.s3Key !== request.expectedReplacementKey) {
      throw new ServiceError(409, "A selected source changed. Refresh your sources before replacing it.");
    }
    if (currentSource.status === "PENDING" || currentSource.status === "PROCESSING") {
      throw new ServiceError(409, "Wait for the existing source to finish processing before replacing it.");
    }
    if (replacementSource.status !== "COMPLETED") {
      throw new ServiceError(409, "The replacement must finish processing successfully first.");
    }
    if (currentSource.sourceType !== replacementSource.sourceType) {
      throw new ServiceError(400, "Choose a replacement of the same source type.");
    }

    const replacementChunks = await transaction.documentChunk.findMany({
      where: { documentId: replacementSource.id },
      select: { content: true },
    });
    if (!replacementChunks.some(chunk => hasReadableText(chunk.content))) {
      throw new ServiceError(409, "The replacement has no readable indexed text. Add a corrected source first.");
    }

    await transaction.documentChunk.deleteMany({ where: { documentId: currentSource.id } });
    await transaction.documentChunk.updateMany({
      where: { documentId: replacementSource.id },
      data: { documentId: currentSource.id },
    });
    const document = await transaction.document.update({
      where: { id: currentSource.id },
      data: {
        originalName: replacementSource.originalName,
        fileName: replacementSource.fileName,
        sourceUrl: replacementSource.sourceUrl,
        s3Key: replacementSource.s3Key,
        status: "COMPLETED",
        failureReason: null,
      },
    });
    // Its chunks now belong to the original document. Removing the staging row
    // makes queued work for that row stale while preserving the original ID.
    await transaction.document.delete({ where: { id: replacementSource.id } });
    return { document, oldSourceKey: currentSource.s3Key };
  }, { maxWait: 10_000, timeout: 10_000 });

  if (result.oldSourceKey !== result.document.s3Key) {
    await deleteFile(result.oldSourceKey).catch(() => {
      console.warn("Replaced source object cleanup failed", { documentId: result.document.id });
    });
  }
  return result.document;
}
