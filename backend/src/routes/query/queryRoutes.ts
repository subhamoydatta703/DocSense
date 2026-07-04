import { Router } from "express";
import { authMiddleware } from "../../middlewares/authMiddleware";
import { queryController } from "../../controllers/query/queryController";

const router = Router();

router.post("/query", authMiddleware, queryController);

export default router;
