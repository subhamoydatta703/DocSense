import { Router } from "express";
import { authMiddleware } from "../../middlewares/authMiddleware";
import { rateLimiter } from "../../middlewares/rateLimiterMiddleware";
import { youtubeContent } from "../../controllers/youtube/youtubeController";
import { uploadYoutubeTranscript } from "../../controllers/youtube/youtubeTranscriptController";
import { uploadYoutubeMedia } from "../../controllers/youtube/youtubeMediaController";
import transcriptUpload from "../../middlewares/transcriptUploadMiddleware";
import youtubeMediaUpload from "../../middlewares/youtubeMediaUploadMiddleware";
import multer from "multer";

const router = Router();

router.post("/youtube", authMiddleware, rateLimiter, youtubeContent);

router.post("/youtube/transcript-upload", authMiddleware, rateLimiter, (req, res, next) => {
  transcriptUpload.single("transcript")(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      const message = err.code === "LIMIT_FILE_SIZE"
        ? "Transcript file exceeds the 2MB limit."
        : `Upload error: ${err.message}`;
      return res.status(400).json({ success: false, message });
    }
    if (err) {
      return res.status(400).json({
        success: false,
        message: err instanceof Error ? err.message : "Transcript upload failed.",
      });
    }
    return uploadYoutubeTranscript(req, res);
  });
});

router.post("/youtube/media-upload", authMiddleware, rateLimiter, (req, res) => {
  youtubeMediaUpload.single("media")(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      const message = err.code === "LIMIT_FILE_SIZE"
        ? "Media file exceeds the 50MB limit."
        : `Upload error: ${err.message}`;
      return res.status(400).json({ success: false, message });
    }
    if (err) {
      return res.status(400).json({
        success: false,
        message: err instanceof Error ? err.message : "Media upload failed.",
      });
    }
    return uploadYoutubeMedia(req, res);
  });
});

export default router;
