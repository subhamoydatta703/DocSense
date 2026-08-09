import { Router } from "express";
import { authMiddleware } from "../../middlewares/authMiddleware";
import { rateLimiter } from "../../middlewares/rateLimiterMiddleware";
import { uploadRawText } from "../../controllers/text/textController";

const router = Router();

router.post("/text", authMiddleware, rateLimiter, uploadRawText);

export default router;
