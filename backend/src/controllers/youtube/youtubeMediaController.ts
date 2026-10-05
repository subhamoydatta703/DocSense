import { randomUUID } from "node:crypto";
import { splitSourceText, SourceValidationError } from "../../utils/sourceText";
import { runQueryStage, ServiceError } from "../../errors/serviceError";
import { z } from "zod";
import type { Response } from "express";
import type { AuthenticatedRequest } from "../../middlewares/authMiddleware";
import { uploadFile } from "../../services/storage/s3storageService";
import { enqueueDocument } from "../../queue/documentQueue";
import { createFileDBYoutubeTranscript } from "../../services/youtube/uploadYouTubeService";
import { transcribeUploadedMedia } from "../../services/youtube/mediaTranscriptionService";
import { CreateWebUrlSchema } from "../../utils/urlSecurity";

/**
 * Validates magic byte header signatures for uploaded audio and video files.
 */
function hasSupportedMediaSignature(buffer: Buffer): boolean {
  if (buffer.length < 12) return false;
  const signature = buffer.subarray(0, 12);
  const isWav = signature.subarray(0, 4).toString("ascii") === "RIFF" &&
    signature.subarray(8, 12).toString("ascii") === "WAVE";
  const isFlac = signature.subarray(0, 4).toString("ascii") === "fLaC";
  const isOgg = signature.subarray(0, 4).toString("ascii") === "OggS";
  const isWebm = signature[0] === 0x1a && signature[1] === 0x45 &&
    signature[2] === 0xdf && signature[3] === 0xa3;
  const isMp4Family = signature.subarray(4, 8).toString("ascii") === "ftyp";
  const isMp3 = signature.subarray(0, 3).toString("ascii") === "ID3" ||
    (signature[0] === 0xff && (signature[1]! & 0xe0) === 0xe0);
  const isAac = signature[0] === 0xff && (signature[1]! & 0xf6) === 0xf0;
  return isWav || isFlac || isOgg || isWebm || isMp4Family || isMp3 || isAac;
}

/**
 * Transcribes uploaded audio/video files via Gemini API and enqueues the transcript for vector indexing.
 */
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
    if (!hasSupportedMediaSignature(req.file.buffer)) {
      return res.status(400).json({
        success: false,
        message: "The uploaded file does not match a supported audio or video format.",
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

    const mediaFile = req.file;
    const transcript = await runQueryStage("media_transcription", () => transcribeUploadedMedia(
      mediaFile.buffer,
      mediaFile.mimetype,
      mediaFile.originalname,
    ));
    await splitSourceText(transcript);
    const transcriptName = `${safeBaseName}.txt`;
    const s3Key = `youtube-transcripts/${req.userId}/${randomUUID()}-${safeBaseName}.txt`;
    const uploadedKey = await uploadFile(Buffer.from(transcript, "utf8"), s3Key);
    const fileData = await createFileDBYoutubeTranscript(
      uploadedKey,
      transcriptName,
      transcriptName,
      sourceUrl,
      req.userId!,
    );

    const job = await enqueueDocument(fileData.Document);

    console.info("Queued transcribed YouTube media", {
      documentId: fileData.Document.id,
      jobId: job?.id,
    });

    return res.status(200).json({
      success: true,
      message: "Media transcribed and saved. Processing will start when the queue is available.",
      fileData,
    });
  } catch (error) {
    if (error instanceof SourceValidationError) return res.status(422).json({ success: false, message: error.message });
    if (error instanceof z.ZodError) return res.status(400).json({ success: false, message: "Please provide a valid HTTPS YouTube source URL." });
    if (error instanceof ServiceError) {
      if (error.status === 429 || error.status === 503) res.set("Retry-After", "30");
      return res.status(error.status).json({ success: false, message: error.message, stage: error.stage });
    }
    console.error("YouTube media transcription error:", error);
    return res.status(500).json({
      success: false,
      message: "Could not transcribe the uploaded media.",
    });
  }
};
