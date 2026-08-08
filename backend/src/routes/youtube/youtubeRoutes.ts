import { Router } from "express";
import { authMiddleware } from "../../middlewares/authMiddleware";
import { rateLimiter } from "../../middlewares/rateLimiterMiddleware";
import { youtubeContent } from "../../controllers/youtube/youtubeController";

const router = Router();

router.post("/youtube", authMiddleware, rateLimiter, youtubeContent);

export default router;


