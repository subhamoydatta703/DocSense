import { Router } from "express";
import { authMiddleware } from "../../middlewares/authMiddleware";
import { rateLimiter } from "../../middlewares/rateLimiterMiddleware";
import { webUrlContent } from "../../controllers/web-url/weburlController";


const router = Router();

router.post("/weburl", authMiddleware, rateLimiter, webUrlContent);

export default router;