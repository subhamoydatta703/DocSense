import type { Response } from "express";
import type { AuthenticatedRequest } from "../../middlewares/authMiddleware";
import { uploadFile } from "../../services/storage/s3storageService";
import { DocumentQueue } from "../../queue/documentQueue";
import { createFileDBText } from "../../services/text/uploadTextService";
import { z } from "zod";

const TextIngestionSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(250, "Title must be 250 characters or less"),
  text: z.string().trim().min(20, "Text must be at least 20 characters long").max(500000, "Text exceeds the 500,000 character limit"),
});

export const uploadRawText = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const validated = TextIngestionSchema.parse(req.body);
    const userId = req.userId!;

    const safeTitle = validated.title.replace(/[<>:"/\\|?*\x00-\x1F]/g, "_") || "pasted-text";
    const safeOriginalName = validated.title.endsWith(".txt") ? validated.title : `${validated.title}.txt`;
    const safeFileName = `${Date.now()}-${safeTitle}.txt`;
    const s3Key = `text-sources/${userId}/${safeFileName}`;

    const buffer = Buffer.from(validated.text, "utf-8");
    const uploadedKey = await uploadFile(buffer, s3Key);

    const fileData = await createFileDBText(uploadedKey, safeFileName, safeOriginalName, userId);

    console.info("Text source record created", { documentId: fileData.Document.id });

    const job = await DocumentQueue.add("document-analysis", {
      documentId: fileData.Document.id,
    });

    console.info("Queued raw text document for analysis", {
      documentId: fileData.Document.id,
      jobId: job.id,
    });

    return res.status(200).json({
      success: true,
      message: "Text document uploaded and processing started successfully",
      fileData,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        message: "Validation error",
        errors: error.issues,
      });
    }
    console.error("uploadRawText controller error:", error);
    return res.status(500).json({
      success: false,
      message: "Error processing text document ingestion",
    });
  }
};
