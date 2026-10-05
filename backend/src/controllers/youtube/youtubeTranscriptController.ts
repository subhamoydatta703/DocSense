import { randomUUID } from "node:crypto";
import type { Response } from "express";
import type { AuthenticatedRequest } from "../../middlewares/authMiddleware";
import { uploadFile } from "../../services/storage/s3storageService";
import { enqueueDocument } from "../../queue/documentQueue";
import { createFileDBYoutubeTranscript } from "../../services/youtube/uploadYouTubeService";
import { CreateWebUrlSchema } from "../../utils/urlSecurity";
import { splitSourceText, SourceValidationError } from "../../utils/sourceText";

/**
 * Ingests an uploaded plain-text YouTube transcript file, stores to S3, and enqueues vector indexing.
 */
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

    let transcript: string;
    try { transcript = new TextDecoder("utf-8", { fatal: true }).decode(req.file.buffer).trim(); }
    catch { return res.status(400).json({ success: false, message: "The transcript must be a valid UTF-8 text file." }); }
    if (req.file.buffer.includes(0)) {
      return res.status(400).json({
        success: false,
        message: "The transcript must be a plain-text UTF-8 file.",
      });
    }
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

    await splitSourceText(transcript);

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
    const s3Key = `youtube-transcripts/${userId}/${randomUUID()}-${safeBaseName}.txt`;

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

    const job = await enqueueDocument(fileData.Document);

    console.info("Queued uploaded YouTube transcript", {
      documentId: fileData.Document.id,
      jobId: job?.id,
    });

    return res.status(200).json({
      success: true,
      message: "Transcript saved. Processing will start when the queue is available.",
      fileData,
    });
  } catch (error) {
    if (error instanceof SourceValidationError) return res.status(422).json({ success: false, message: error.message });
    console.error("YouTube transcript upload error:", error);
    return res.status(400).json({
      success: false,
      message: error instanceof Error ? error.message : "Could not upload transcript.",
    });
  }
};
