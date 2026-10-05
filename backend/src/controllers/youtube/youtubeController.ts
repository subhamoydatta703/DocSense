import { randomUUID } from "node:crypto";
import { splitSourceText, SourceValidationError } from "../../utils/sourceText";
import type { Response } from "express";
import type { AuthenticatedRequest } from "../../middlewares/authMiddleware";
import { uploadFile } from '../../services/storage/s3storageService';
import { enqueueDocument } from '../../queue/documentQueue';
import { createFileDBYoutubeUrl } from "../../services/youtube/uploadYouTubeService";
import {
    transcriptYoutubeVideo,
    YoutubeTranscriptUnavailableError,
    YoutubeTranscriptRateLimitedError,
} from "../../services/youtube/transcriptService";
import { YoutubeTranscriptProviderError } from "../../services/youtube/supadataTranscriptService";
import { CreateWebUrlSchema, assertPublicHttpsUrl } from '../../utils/urlSecurity';
import z from 'zod';
import { ServiceError } from '../../errors/serviceError';


/**
 * Fetches transcript for YouTube video URL, stores to S3, and enqueues vector indexing.
 */
export const youtubeContent = async (req: AuthenticatedRequest, res: Response) => {
    try {
        const validated = CreateWebUrlSchema.parse({ url: req.body.url });

        const parsedUrl = new URL(validated.url);
        const hostname = parsedUrl.hostname.toLowerCase();
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
                message: "Please provide a valid YouTube video URL.",
            });
        }
        await assertPublicHttpsUrl(validated.url);

        const { transcriptContent, title, channel, videoId, sourceUrl } = await transcriptYoutubeVideo(validated.url);
        await splitSourceText(transcriptContent);


        const userId = req.userId!;


        // Generate S3 key
        const safeName = title.replace(/[<>:"/\\|?*\x00-\x1F]/g, "_");

        const safeFileName =  `${videoId}.txt`;
        const safeOriginalName = `${title}.txt`

        const s3Key = `youtube-sources/${randomUUID()}-${safeName}.txt`;
    

        // Upload to S3
        const buffer = Buffer.from(transcriptContent, "utf-8");
        const uploadedKey = await uploadFile(buffer, s3Key);

        const fileData = await createFileDBYoutubeUrl(uploadedKey, safeFileName, safeOriginalName, validated.url, userId);

        console.info("YouTube source record created", { documentId: fileData.Document.id });

        await enqueueDocument(fileData.Document);



        return res.status(200).json({
            success: true,
            message: "Document saved. Processing will start when the queue is available.",
            fileData,
        });

    } catch (error) {
        if (error instanceof ServiceError) return res.status(error.status).json({ success: false, message: error.message });
        if (error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError")) {
            return res.status(504).json({ success: false, message: "YouTube took too long to respond. Please try again." });
        }
        if (error instanceof SourceValidationError) return res.status(422).json({ success: false, message: error.message });
        if (error instanceof z.ZodError) {
            return res.status(400).json({
                success: false,
                message: "Validation error",
                errors: error.issues,
            });
        }
        if (error instanceof YoutubeTranscriptUnavailableError) {
            return res.status(400).json({
                success: false,
                message: "This YouTube video does not have captions accessible to DocSense.",
            });
        }
        if (error instanceof YoutubeTranscriptRateLimitedError) {
            res.set("Retry-After", String(error.retryAfterSeconds));
            return res.status(429).json({
                success: false,
                message: "YouTube is temporarily rate-limiting transcript requests. Please try again later.",
                retryAfterSeconds: error.retryAfterSeconds,
            });
        }
        if (error instanceof YoutubeTranscriptProviderError) {
            const status = error.status === 401 || error.status === 403
                ? 502
                : error.status === 402
                    ? 503
                    : error.status === 429
                        ? 429
                        : error.status >= 500 ? error.status : 422;
            return res.status(status).json({
                success: false,
                message: error.message,
            });
        }
        console.error("youtubeController error ", error);
       return res.status(500).json({
        success: false,
        message: "Error processing request",
       })
    }
}

