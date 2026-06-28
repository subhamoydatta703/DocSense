import { Router } from "express";
import upload from "../middlewares/multerMiddleware";
import { uploadDocument } from "../controllers/uploadDocumentController";
import { authMiddleware } from "../middlewares/authMiddleware";
import multer from "multer";

const router = Router();

router.post("/upload", authMiddleware, (req, res, next) => {
    upload.single("resume")(req, res, (err) => {
        if (err instanceof multer.MulterError) {
            if (err.code === "LIMIT_FILE_SIZE") {
                return res.status(400).json({
                    success: false,
                    message: "File size exceeds the 5MB limit.",
                });
            }
            return res.status(400).json({
                success: false,
                message: `Upload error: ${err.message}`,
            });
        } else if (err) {
            return res.status(400).json({
                success: false,
                message: err.message,
            });
        }
        // Proceed to controller
        uploadDocument(req, res);
    });
});

export default router;