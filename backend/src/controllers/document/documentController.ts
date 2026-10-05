import { randomUUID } from "node:crypto";
import type { Response } from "express";
import { createFileDB, deleteDocumentService } from "../../services/document/uploadDocumentService";
import { uploadFile } from "../../services/storage/s3storageService";
import type { AuthenticatedRequest } from "../../middlewares/authMiddleware";
import { enqueueDocument } from "../../queue/documentQueue";
import { prisma } from "../../config/db/db";
import { ServiceError } from "../../errors/serviceError";

/**
 * Handles PDF document upload, stores the file in S3, creates DB record, and enqueues processing job.
 */
export const uploadDocument = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No file uploaded",
      });
    }
    if (!req.file.buffer.subarray(0, 1024).includes(Buffer.from("%PDF-"))) {
      return res.status(400).json({ success: false, message: "The uploaded file is not a valid PDF." });
    }
    const originalName = req.file.originalname;
    const userId = req.userId!;

    // Generate S3 key
    const s3Key = `documents/${randomUUID()}-${originalName}`;

    // Upload to S3
    const uploadedKey = await uploadFile(req.file.buffer, s3Key);

    // Save to DB
    const fileData = await createFileDB(uploadedKey, originalName, userId);

    console.info("Document record created", { documentId: fileData.Document.id });

    await enqueueDocument(fileData.Document);



    return res.status(200).json({
      success: true,
      message: "Document saved. Processing will start when the queue is available.",
      fileData,
    });
  } catch (error) {
    console.error("upload document controller error ", error);
    return res.status(500).json({
      success: false,
      message: "upload document controller error",
    });
  }
};


/**
 * Fetches a single document record by ID for the authenticated user.
 */
export const getDocumentById = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const documentId = req.params.id as string;
    const document = await prisma.document.findFirst({
      where: { id: documentId, userId: userId },
    });
    if (!document) {
      return res.status(404).json({
        success: false,
        message: "Document not found",
      });
    }
    return res.status(200).json({
      success: true,
      message: "Document fetched successfully",
      document,
    });
  } catch (error) {
    console.error("getDocumentById controller error ", error);
    return res.status(500).json({
      success: false,
      message: "getDocumentById controller error",
    });
  }
};


/**
 * Fetches all document records belonging to the authenticated user.
 */
export const getDocuments = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.userId!;

    const documents = await prisma.document.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });

    return res.status(200).json({
      success: true,
      message: "Documents fetched successfully",
      documents,
    });
  } catch (error) {
    console.error("getDocuments controller error ", error);
    return res.status(500).json({
      success: false,
      message: "getDocuments controller error",
    });
  }
};


/**
 * Deletes a document, removing its S3 file, vector chunks, cache, and database record.
 */
export const deleteDocument = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const documentId = req.params.documentId as string;

    await deleteDocumentService(documentId, userId);

    return res.status(200).json({
      success: true,
      message: "Document deleted successfully",
    });
  } catch (error) {
    console.error("deleteDocument controller error ", error);
    if (error instanceof ServiceError) return res.status(error.status).json({ success: false, message: error.message });
    return res.status(500).json({
      success: false,
      message: "deleteDocument controller error",
    });
  }
}
