import { Worker, UnrecoverableError } from "bullmq";
import { bullRedisConnection } from "../../config/redis/redisBullMQ";
import { prisma } from "../../config/db/db";
import { processDocumentService } from "../processing/processDocumentService";
import { StaleDocumentError } from "../../errors/staleDocumentError";
import { withDeadline } from "../../utils/deadline";

let worker: Worker | undefined;
let ready = false;
let heartbeatTimer: ReturnType<typeof setInterval> | undefined;
export function isWorkerReady() { return ready && Boolean(worker?.isRunning()) && bullRedisConnection.status === "ready"; }
export async function stopWorker() { ready = false; clearInterval(heartbeatTimer); heartbeatTimer = undefined; await worker?.close(); worker = undefined; }
function startHeartbeat() {
  if (heartbeatTimer) return;
  const heartbeat = () => {
    if (isWorkerReady()) void bullRedisConnection.set("docsense:worker:heartbeat", "ready", "EX", 30).catch(() => console.warn("Worker heartbeat unavailable"));
  };
  heartbeat();
  heartbeatTimer = setInterval(heartbeat, 10_000);
}

/**
 * Initializes and starts the BullMQ background worker listener for document analysis jobs.
 */
export async function startWorker() {
  if (worker) {
    await withDeadline(worker.waitUntilReady(), 15_000, "Worker startup timed out");
    ready = true;
    startHeartbeat();
    return;
  }
  console.log("BullMQ Worker starting...");

  worker = new Worker(
    "document-analysis",
    async (job) => {
      const { documentId } = job.data;

      console.log(`Processing job ${job.id} for file ${documentId}`);

      if (!documentId) {
        throw new Error("Invalid or missing file ID");
      }

      // Old queued jobs have no source version; let recovery create a versioned job.
      if (typeof job.data.s3Key !== "string") return;
      try { await processDocumentService(documentId, job.data.s3Key); }
      catch (error) {
        if (error instanceof StaleDocumentError) return;
        if (error instanceof UnrecoverableError || job.attemptsMade + 1 >= (job.opts.attempts || 1)) {
          await prisma.document.updateMany({ where: { id: documentId, s3Key: job.data.s3Key }, data: { status: "FAILED" } });
        }
        throw error;
      }
    },
    {
      connection: bullRedisConnection as any,
      concurrency: 1,
      limiter: { max: 10, duration: 60_000 },
    }
  );

  worker.on("completed", (job) => {
    console.log(`Job ${job.id} completed successfully`);
  });

  worker.on("failed", async (job, err) => {

    console.error("JOB FAILED");
    console.error("Job ID:", job?.id);
    console.error("Document ID:", job?.data?.documentId);
    console.error("Error Message:", err.message);
    console.error("Error Stack:", err.stack);


    // Status is updated inside the processor only after its final attempt.
    // Recovery also reconciles failed jobs if that database update was unavailable.
  });

  worker.on("error", (err) => {
    console.error("Worker runtime error:", err);
  });

  worker.on("closing", () => {
    console.log("WORKER CLOSING");
  });

  worker.on("closed", () => {
    console.log("WORKER CLOSED");
  });

  await withDeadline(worker.waitUntilReady(), 15_000, "Worker startup timed out");
  ready = true;
  startHeartbeat();
  console.log("BullMQ Worker started successfully");
}
