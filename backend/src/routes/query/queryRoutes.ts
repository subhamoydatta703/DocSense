import { Router } from "express";
import { authMiddleware } from "../../middlewares/authMiddleware";
import { rateLimiter } from "../../middlewares/rateLimiterMiddleware";
import { queryController } from "../../controllers/query/queryController";

const router = Router();

router.post("/query", authMiddleware, rateLimiter, queryController);

export default router;
