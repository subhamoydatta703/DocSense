import type { Response } from "express";
import type { AuthenticatedRequest } from "../../middlewares/authMiddleware";
import { uploadFile } from "../../services/storage/s3storageService";
import { DocumentQueue } from "../../queue/documentQueue";
import { createFileDBYoutubeTranscript } from "../../services/youtube/uploadYouTubeService";
import { transcribeUploadedMedia } from "../../services/youtube/mediaTranscriptionService";
import { CreateWebUrlSchema } from "../../utils/urlSecurity";

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
    (signature[0] === 0xff && (signature[1] & 0xe0) === 0xe0);
  const isAac = signature[0] === 0xff && (signature[1] & 0xf6) === 0xf0;
  return isWav || isFlac || isOgg || isWebm || isMp4Family || isMp3 || isAac;
}

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
