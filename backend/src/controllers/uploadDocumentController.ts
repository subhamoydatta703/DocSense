import type { Response } from "express";
import { createFileDB } from "../services/document/uploadDocumentService";
import { uploadFile } from "../services/storage/s3storageService";
import type { AuthenticatedRequest } from "../middlewares/authMiddleware";

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

    return res.status(200).json({
      success: true,
      message: "Document uploaded successfully",
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