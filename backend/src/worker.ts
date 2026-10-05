import "./config/env";
import { startWorker, stopWorker } from "./services/worker/workerService";
import { bullRedisConnection, queueRedisConnection, verifyBullMQConnection } from "./config/redis/redisBullMQ";
import { DocumentQueue, startQueueRecovery, stopQueueRecovery } from "./queue/documentQueue";
import { prisma } from "./config/db/db";
import { withDeadline } from "./utils/deadline";

let stopping = false;
let timer: ReturnType<typeof setTimeout> | undefined;
async function initialize() {
  try { await verifyBullMQConnection(); await startWorker(); startQueueRecovery(); }
  catch { console.error("Worker dependencies unavailable; startup will retry"); if (!stopping) timer = setTimeout(initialize, 5_000); }
}
async function shutdown() {
  if (stopping) return;
  stopping = true;
  clearTimeout(timer);
  stopQueueRecovery();
  try {
    const closeResources = async () => { await stopWorker(); await DocumentQueue.close(); await prisma.$disconnect(); };
    await withDeadline(closeResources(), 20_000, "Worker shutdown deadline reached");
  }
  catch { console.warn("Unfinished jobs will recover on restart"); }
  bullRedisConnection.disconnect();
  queueRedisConnection.disconnect();
  process.exit(0);
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
void initialize();
