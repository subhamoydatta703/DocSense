import { prisma, Prisma } from "../../config/db/db";
import { redisClient } from "../../config/redis/redisCaching";
import { deleteFile } from "../storage/s3storageService";
import { deleteVectorsByDocumentId } from "../vectors/vectorService";

export const createFileDBWebUrl = async (
  s3Key: string,
  originalName: string,
  url: string,
  userId: string
) => {
  // Check for duplicates based on originalName AND userId
  const existingWebUrl = await prisma.document.findFirst({
    where: {
      sourceUrl: url,
      sourceType: "WEBSITE",
      userId: userId,
    },
  });
  console.info("Checked for an existing web source", { duplicateFound: Boolean(existingWebUrl) });

  if (existingWebUrl) {
    // Clean up old file from S3
    try {
      await deleteFile(existingWebUrl.s3Key);
    } catch (err) {
      console.error("Failed to delete old file from S3:", err);
    }

    // delete chunks
    try {
      await deleteVectorsByDocumentId(existingWebUrl.id);
    } catch (error) {
      console.error("Error deleting old chunks in upload document service: ", error);
      throw error;
    }

    const cacheKey = `user:${userId}:Document:${existingWebUrl.id}`;
    try {
      await redisClient.del(cacheKey);
    } catch (err) {
      console.error("Failed to invalidate Redis cache:", err);
    }

    const updatedDocument = await prisma.document.update({
      where: { id: existingWebUrl.id },
      data: {
        fileName: originalName,
        s3Key: s3Key,
        status: "PENDING",
      },
    });

    return { Document: updatedDocument };
  }

  const Document = await prisma.document.create({
    data: {
      fileName: originalName,
      s3Key: s3Key,
      originalName: originalName,
      sourceUrl: url,
      sourceType: "WEBSITE",
      userId: userId,
    },
  });

  return { Document };
};
