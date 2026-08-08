import type { Response } from "express";
import type { AuthenticatedRequest } from "../../middlewares/authMiddleware";
import { uploadFile } from "../../services/storage/s3storageService";
import { DocumentQueue } from "../../queue/documentQueue";
import { createFileDBYoutubeTranscript } from "../../services/youtube/uploadYouTubeService";
import { transcribeUploadedMedia } from "../../services/youtube/mediaTranscriptionService";
import { CreateWebUrlSchema } from "../../utils/urlSecurity";

export const uploadYoutubeMedia = async (
  req: AuthenticatedRequest,
  res: Response,
) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No audio or video file uploaded.",
      });
    }

    const sourceUrlValue = typeof req.body?.sourceUrl === "string"
      ? req.body.sourceUrl.trim()
      : "";
    let sourceUrl: string | undefined;
    if (sourceUrlValue) {
      const validated = CreateWebUrlSchema.parse({ url: sourceUrlValue });
      const hostname = new URL(validated.url).hostname.toLowerCase();
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
    const safeBaseName = req.file.originalname
      .replace(/[^a-zA-Z0-9._-]/g, "_")
      .replace(/\.[^.]+$/, "") || "youtube-media";

    const transcript = await transcribeUploadedMedia(
      req.file.buffer,
      req.file.mimetype,
      req.file.originalname,
    );
    const transcriptName = `${safeBaseName}.txt`;
    const s3Key = `youtube-transcripts/${req.userId}/${Date.now()}-${safeBaseName}.txt`;
    const uploadedKey = await uploadFile(Buffer.from(transcript, "utf8"), s3Key);
    const fileData = await createFileDBYoutubeTranscript(
      uploadedKey,
      transcriptName,
      transcriptName,
      sourceUrl,
      req.userId!,
    );

    const job = await DocumentQueue.add("document-analysis", {
      documentId: fileData.Document.id,
    });

    console.info("Queued transcribed YouTube media", {
      documentId: fileData.Document.id,
      jobId: job.id,
    });

    return res.status(200).json({
      success: true,
      message: "Media transcribed and processing started successfully.",
      fileData,
    });
  } catch (error) {
    console.error("YouTube media transcription error:", error);
    return res.status(500).json({
      success: false,
      message: "Could not transcribe the uploaded media.",
    });
  }
};
