import type { Response } from "express";
import type { AuthenticatedRequest } from "../../middlewares/authMiddleware";
import { uploadFile } from "../../services/storage/s3storageService";
import { DocumentQueue } from "../../queue/documentQueue";
import { createFileDBYoutubeTranscript } from "../../services/youtube/uploadYouTubeService";
import { CreateWebUrlSchema } from "../../utils/urlSecurity";

export const uploadYoutubeTranscript = async (
  req: AuthenticatedRequest,
  res: Response,
) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No transcript file uploaded.",
      });
    }

    const transcript = req.file.buffer.toString("utf8").trim();
    if (!transcript) {
      return res.status(400).json({
        success: false,
        message: "The transcript file is empty.",
      });
    }

    if (transcript.length < 20) {
      return res.status(400).json({
        success: false,
        message: "The transcript is too short to index.",
      });
    }

    const sourceUrlValue = typeof req.body?.sourceUrl === "string"
      ? req.body.sourceUrl.trim()
      : "";
    let sourceUrl: string | undefined;

    if (sourceUrlValue) {
      const validated = CreateWebUrlSchema.parse({ url: sourceUrlValue });
      const parsed = new URL(validated.url);
      const hostname = parsed.hostname.toLowerCase();
      const isYouTubeHost = new Set([
        "youtube.com",
        "www.youtube.com",
        "m.youtube.com",
        "youtu.be",
        "www.youtu.be",
      ]).has(hostname);
      if (!isYouTubeHost) {
        return res.status(400).json({
          success: false,
          message: "sourceUrl must be a YouTube URL.",
        });
      }
      sourceUrl = validated.url;
    }

    const userId = req.userId!;
    const safeBaseName = req.file.originalname
      .replace(/[^a-zA-Z0-9._-]/g, "_")
      .replace(/\.txt$/i, "") || "youtube-transcript";
    const originalName = `${safeBaseName}.txt`;
    const s3Key = `youtube-transcripts/${userId}/${Date.now()}-${safeBaseName}.txt`;

    const uploadedKey = await uploadFile(
      Buffer.from(transcript, "utf8"),
      s3Key,
    );
    const fileData = await createFileDBYoutubeTranscript(
      uploadedKey,
      originalName,
      originalName,
      sourceUrl,
      userId,
    );

    const job = await DocumentQueue.add("document-analysis", {
      documentId: fileData.Document.id,
    });

    console.info("Queued uploaded YouTube transcript", {
      documentId: fileData.Document.id,
      jobId: job.id,
    });

    return res.status(200).json({
      success: true,
      message: "Transcript uploaded and processing started successfully.",
      fileData,
    });
  } catch (error) {
    console.error("YouTube transcript upload error:", error);
    return res.status(400).json({
      success: false,
      message: error instanceof Error ? error.message : "Could not upload transcript.",
    });
  }
};
