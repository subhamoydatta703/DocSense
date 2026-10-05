import { prisma } from "../../config/db/db";
import { deleteFile } from "../storage/s3storageService";
import { saveDocumentSource } from "./saveDocumentSource";
import { ServiceError } from "../../errors/serviceError";

export const createFileDB = (s3Key: string, originalName: string, userId: string) =>
  saveDocumentSource({ s3Key, originalName, fileName: originalName, userId, sourceType: "PDF" });
/**
 * Updates document metadata for the authorized document owner.
 */
export const updateDocumentService = async (DocumentID: string, userId: string, data: any) => {
  const Document = await prisma.document.findUnique({
    where: { id: DocumentID },
    select: { userId: true },
  });

  if (!Document) {
    throw new ServiceError(404, "Document not found.");
  }

  if (Document.userId !== userId) {
    throw new ServiceError(404, "Document not found.");
  }

  return await prisma.document.update({
    where: { id: DocumentID },
    data,
  });
};

/**
 * Deletes the document and chunks atomically, then removes its storage object.
 */
export const deleteDocumentService = async (DocumentID: string, userId: string) => {
  const Document = await prisma.document.findUnique({
    where: { id: DocumentID },
    select: { userId: true, s3Key: true },
  });

  if (!Document) {
    throw new ServiceError(404, "Document not found.");
  }

  if (Document.userId !== userId) {
    throw new ServiceError(404, "Document not found.");
  }

  // Lock the same row as chunk writes, then cascade-delete atomically.
  const deleted = await prisma.$transaction(async tx => {
    const current = await tx.$queryRaw<Array<{ s3Key: string }>>`
      SELECT "s3Key" FROM "Document" WHERE id = ${DocumentID} AND "userId" = ${userId} FOR UPDATE
    `;
    if (!current[0]) throw new ServiceError(404, "Document not found.");
    await tx.document.delete({ where: { id: DocumentID } });
    return current[0];
  });

  // Remove storage only after the database deletion succeeds.
  try {
    await deleteFile(deleted.s3Key);
  } catch (err) {
    console.error("Error deleting from S3 during delete service: ", err);
  }

  return deleted;
};

/**
 * Retrieves the S3 key path for a given document ID.
 */
export const getS3KeyFromDB = async (documentId: string) => {
  try {
    const file = await prisma.document.findUnique({
      where: { id: documentId },
      select: { s3Key: true },
    });
    if (!file) {
      throw new Error("File not found");
    }
    return file.s3Key;
  } catch (error) {
    console.error("Error while get S3 key from DB in service", error);
    throw error;
  }
}
