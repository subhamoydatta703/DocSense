import "./config/env";
import app from "./app";
import { connectRedis } from "./config/redis/redisCaching";
import { verifyBullMQConnection, bullRedisConnection, queueRedisConnection } from "./config/redis/redisBullMQ";
import { redisClient } from "./config/redis/redisCaching";
import { startWorker, stopWorker } from "./services/worker/workerService";
import { startQueueRecovery, stopQueueRecovery, DocumentQueue } from "./queue/documentQueue";
import { prisma } from "./config/db/db";
import { withDeadline } from "./utils/deadline";

const PORT = process.env.PORT || 5000;

/**
 * Starts the Express HTTP server after verifying Redis cache, BullMQ, and worker connections.
 */
let stopping = false;
let startupTimer: ReturnType<typeof setTimeout> | undefined;
const server = app.listen(PORT, () => console.log(`Server is running on port ${PORT}`));

async function initializeDependencies() {
  try {
    // Health checks for both Redis instances
    await connectRedis();
    await verifyBullMQConnection();
    if (process.env.RUN_WORKER !== "false") await startWorker();
    startQueueRecovery();
  } catch (error) {
    console.error("Dependencies are not ready; startup will retry", { errorType: error instanceof Error ? error.name : "UnknownError" });
    if (!stopping) startupTimer = setTimeout(initializeDependencies, 5_000);
  }
}

async function shutdown() {
  if (stopping) return;
  stopping = true;
  clearTimeout(startupTimer);
  stopQueueRecovery();
  try {
    const closeResources = async () => {
    await Promise.all([
      new Promise<void>(resolve => server.close(() => resolve())),
      stopWorker(),
    ]);
    await DocumentQueue.close();
    await prisma.$disconnect();
    };
    await withDeadline(closeResources(), 20_000, "Shutdown deadline reached");
  } catch { console.warn("Shutdown deadline reached; unfinished jobs will recover on restart"); }
  if (redisClient.isOpen) redisClient.destroy();
  bullRedisConnection.disconnect();
  queueRedisConnection.disconnect();
  process.exit(0);
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
void initializeDependencies();
