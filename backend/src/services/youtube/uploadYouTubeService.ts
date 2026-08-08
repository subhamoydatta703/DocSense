import { prisma, Prisma } from "../../config/db/db";
import { redisClient } from "../../config/redis/redisCaching";
import { deleteFile } from "../storage/s3storageService";
import { deleteVectorsByDocumentId } from "../vectors/vectorService";

export const createFileDBYoutubeUrl = async (
  s3Key: string,
  originalName: string,
  url: string,
  userId: string
) => {
  // Check for duplicates based on originalName AND userId
  const existingYoutubeUrl = await prisma.document.findFirst({
    where: {
      sourceUrl: url,
      sourceType: "YOUTUBE",
      userId: userId,
    },
  });
  console.log("Checking duplicate in DB: ", existingYoutubeUrl);

  if (existingYoutubeUrl) {
    // Clean up old file from S3
    try {
      await deleteFile(existingYoutubeUrl.s3Key);
    } catch (err) {
      console.error("Failed to delete old file from S3:", err);
    }

    // delete chunks
    try {
      await deleteVectorsByDocumentId(existingYoutubeUrl.id);
    } catch (error) {
      console.error("Error deleting old chunks in upload document service: ", error);
      throw error;
    }

    const cacheKey = `user:${userId}:Document:${existingYoutubeUrl.id}`;
    try {
      await redisClient.del(cacheKey);
    } catch (err) {
      console.error("Failed to invalidate Redis cache:", err);
    }

    const updatedDocument = await prisma.document.update({
      where: { id: existingYoutubeUrl.id },
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
      sourceType: "YOUTUBE",
      userId: userId,
    },
  });

  return { Document };
};