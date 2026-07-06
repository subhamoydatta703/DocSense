import { Router } from "express";
import upload from "../../middlewares/multerMiddleware";
import { uploadDocument } from "../../controllers/document/documentController";
import { authMiddleware } from "../../middlewares/authMiddleware";
import multer from "multer";
import { deleteDocument, getDocuments, getDocumentById } from "../../controllers/document/documentController";

const router = Router();


router.get("/documents/:id", authMiddleware, getDocumentById);

router.get("/documents", authMiddleware, getDocuments);


router.post("/upload", authMiddleware, (req, res, next) => {
    upload.single("document")(req, res, (err) => {
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

router.delete("/documents/:id", authMiddleware, deleteDocument);


export default router;