import multer from "multer";
import path from "path";

const allowedMediaTypes = new Set([
  "audio/aac",
  "audio/flac",
  "audio/mpeg",
  "audio/mp3",
  "audio/mp4",
  "audio/ogg",
  "audio/wav",
  "audio/webm",
  "video/mp4",
  "video/mpeg",
  "video/quicktime",
  "video/webm",
]);

const allowedExtensions = new Set([
  ".aac", ".flac", ".mp3", ".mpeg", ".mp4", ".m4a", ".mov", ".ogg",
  ".wav", ".webm",
]);

const youtubeMediaUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    const extension = path.extname(file.originalname).toLowerCase();
    if (allowedMediaTypes.has(file.mimetype) && allowedExtensions.has(extension)) {
      cb(null, true);
      return;
    }
    cb(new Error("Only supported audio/video media files are allowed."));
  },
});

export default youtubeMediaUpload;
