import { Router } from "express";
import { prisma } from "../config/db/db";
import { redisClient } from "../config/redis/redisCaching";
import { queueRedisConnection } from "../config/redis/redisBullMQ";
import { isWorkerReady } from "../services/worker/workerService";
import { withDeadline } from "../utils/deadline";

const router = Router();
router.get("/live", (_req, res) => res.json({ status: "ok" }));
router.get("/health", async (_req, res) => {
  const checks = await Promise.allSettled([
    withDeadline(prisma.$queryRaw`SELECT 1`, 3_000, "Database health timeout"),
    redisClient.isReady ? withDeadline(redisClient.ping(), 3_000, "Cache health timeout") : Promise.reject(new Error("Cache not ready")),
    queueRedisConnection.status === "ready" ? withDeadline(queueRedisConnection.ping(), 3_000, "Queue health timeout") : Promise.reject(new Error("Queue not ready")),
    process.env.RUN_WORKER === "false"
      ? queueRedisConnection.status === "ready" ? withDeadline(queueRedisConnection.get("docsense:worker:heartbeat"), 3_000, "Worker health timeout") : Promise.reject(new Error("Queue not ready"))
      : Promise.resolve(isWorkerReady() ? "ready" : null),
  ]);
  const [database, cache, queue] = checks.map(check => check.status === "fulfilled" ? "connected" : "disconnected");
  const workerCheck = checks[3];
  const worker = workerCheck?.status === "fulfilled" && workerCheck.value === "ready" ? "ready" : "unavailable";
  const isHealthy = checks.every(check => check.status === "fulfilled") && worker === "ready";
  res.status(isHealthy ? 200 : 503).json({ status: isHealthy ? "ok" : "error", timestamp: new Date().toISOString(), uptime: process.uptime(), database, cache, queue, worker });
});
export default router;
