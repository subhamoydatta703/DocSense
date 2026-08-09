import { prisma } from "../../config/db/db";
import { redisClient } from "../../config/redis/redisCaching";
import { deleteFile } from "../storage/s3storageService";
import { deleteVectorsByDocumentId } from "../vectors/vectorService";

export const createFileDBText = async (
  s3Key: string,
  fileName: string,
  originalName: string,
  userId: string
) => {
  // Check for duplicates based on originalName AND userId for TEXT source type
  const existingTextDoc = await prisma.document.findFirst({
    where: {
      originalName: originalName,
      sourceType: "TEXT",
      userId: userId,
    },
  });
  console.info("Checked for an existing text document source", { duplicateFound: Boolean(existingTextDoc) });

  if (existingTextDoc) {
    // Clean up old file from S3
    try {
      await deleteFile(existingTextDoc.s3Key);
    } catch (err) {
      console.error("Failed to delete old text file from S3:", err);
    }

    // Delete existing vector chunks
    try {
      await deleteVectorsByDocumentId(existingTextDoc.id);
    } catch (error) {
      console.error("Error deleting old chunks in text document service: ", error);
      throw error;
    }

    const cacheKey = `user:${userId}:Document:${existingTextDoc.id}`;
    try {
      await redisClient.del(cacheKey);
    } catch (err) {
      console.error("Failed to invalidate Redis cache:", err);
    }

    const updatedDocument = await prisma.document.update({
      where: { id: existingTextDoc.id },
      data: {
        fileName: fileName,
        s3Key: s3Key,
        status: "PENDING",
      },
    });

    return { Document: updatedDocument };
  }

  const Document = await prisma.document.create({
    data: {
      fileName: fileName,
      s3Key: s3Key,
      originalName: originalName,
      sourceType: "TEXT",
      userId: userId,
    },
  });

  return { Document };
};
