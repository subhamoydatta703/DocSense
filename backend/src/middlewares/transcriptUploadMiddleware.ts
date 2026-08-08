import multer from "multer";
import path from "path";

const storage = multer.memoryStorage();

const transcriptUpload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const isText =
      (file.mimetype === "text/plain" || file.mimetype === "application/octet-stream") &&
      path.extname(file.originalname).toLowerCase() === ".txt";

    if (isText) {
      cb(null, true);
    } else {
      cb(new Error("Only plain-text transcript files (.txt) are supported."));
    }
  },
});

export default transcriptUpload;
