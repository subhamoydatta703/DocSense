import { prisma, Prisma } from "../config/db";
import { CreateDocumentSchema } from "../utils/validation";
import { deleteFile } from "./storage/s3storageService";
// import { redisClient } from "../config/redis.caching";

export const createFileDB = async (
  s3Key: string, 
  originalName: string,
  userId: string
) => {
  // Check for duplicates based on originalName AND userId
  const existingDocument = await prisma.document.findFirst({
    where: { 
      originalName: originalName,
      userId: userId,
    },
  });
  console.log("Checking duplicate in DB: ", existingDocument);
  
  if (existingDocument) {
    // Clean up old file from S3
    try {
      await deleteFile(existingDocument.s3Key);
    } catch (err) {
      console.error("Failed to delete old file from S3:", err);
    }

    // const cacheKey = `user:${userId}:Document:${existingDocument.id}`;
    // try {
    //   // await redisClient.del(cacheKey);
    // } catch (err) {
    //   console.error("Failed to invalidate Redis cache:", err);
    // }

    const updatedDocument = await prisma.document.update({
      where: { id: existingDocument.id },
      data: {
        fileName: originalName,
        s3Key: s3Key,
        status: "PENDING",
      },
    });

    return { Document: updatedDocument };
  }
  
  const validatedDocument = CreateDocumentSchema.parse({
    fileName: originalName,
    s3Key: s3Key,
    originalName: originalName,
    userId: userId,
  });

  const Document = await prisma.document.create({ 
    data: validatedDocument,
  });
  
  return { Document };
};

export const updateDocumentService = async (DocumentID: string, userId: string, data: any) => {
  const Document = await prisma.document.findUnique({
    where: { id: DocumentID },
    select: { userId: true },
  });

  if (!Document) {
    throw new Error("Document not found");
  }

  if (Document.userId !== userId) {
    throw new Error("Unauthorized: You do not own this Document");
  }

  return await prisma.document.update({
    where: { id: DocumentID },
    data,
  });
};

export const deleteDocumentService = async (DocumentID: string, userId: string) => {
  const Document = await prisma.document.findUnique({
    where: { id: DocumentID },
    select: { userId: true, s3Key: true },
  });

  if (!Document) {
    throw new Error("Document not found");
  }

  if (Document.userId !== userId) {
    throw new Error("Unauthorized: You do not own this Document");
  }

  // Delete from S3
  try {
    await deleteFile(Document.s3Key);
  } catch (err) {
    console.error("Error deleting from S3 during delete service: ", err);
  }

  return await prisma.document.delete({
    where: { id: DocumentID },
  });
};

export const getS3KeyFromDB = async ( fileID: string ) => {
    try {
      const file = await prisma.document.findUnique({
          where: { id: fileID },
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