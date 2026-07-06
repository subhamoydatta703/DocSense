import type { Response } from "express";
import { createFileDB } from "../../services/document/uploadDocumentService";
import { uploadFile } from "../../services/storage/s3storageService";
import type { AuthenticatedRequest } from "../../middlewares/authMiddleware";
import { DocumentQueue } from "../../queue/documentQueue";
import { prisma } from "../../config/db/db";

// upload document
export const uploadDocument = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No file uploaded",
      });
    }
    const originalName = req.file.originalname;
    const userId = req.userId!;

    // Generate S3 key
    const s3Key = `documents/${Date.now()}-${originalName}`;

    // Upload to S3
    const uploadedKey = await uploadFile(req.file.buffer, s3Key);

    // Save to DB
    const fileData = await createFileDB(uploadedKey, originalName, userId);

    console.log("fileData from upload document controller", JSON.stringify(fileData, null, 2));

    // add job to queue

    const job = await DocumentQueue.add(
      "document-analysis",
      {
        documentId: fileData.Document.id,
      },

    );
    console.log(
      "Added job",
      job.id,
      job.name
    );

    console.log("Job added successfully:", fileData.Document.id);

    const counts = await DocumentQueue.getJobCounts();
    console.log("QUEUE COUNTS:", counts);



    return res.status(200).json({
      success: true,
      message: "Document uploaded and processing started successfully",
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


// get document by id
export const getDocumentById = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const documentId = req.params.documentId as string;
    const document = await prisma.document.findUnique({
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


// get all documents
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


// delete document
export const deleteDocument = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const documentId = req.params.documentId as string;

    

    await prisma.document.delete({
      where: { id: documentId, userId: userId },
    });

    return res.status(200).json({
      success: true,
      message: "Document deleted successfully",
    });
  } catch (error) {
    console.error("deleteDocument controller error ", error);
    return res.status(500).json({
      success: false,
      message: "deleteDocument controller error",
    });
  }
}
