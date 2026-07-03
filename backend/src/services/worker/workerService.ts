import { Worker } from "bullmq";
import { bullRedisConnection } from "../../config/redisBullMQ";
// import { analyzeThisdocument } from "./documentAnalysisService";
import { workerPrisma } from "../../config/workerDB";

let worker: Worker;

export async function startWorker() {
  console.log("BullMQ Worker starting...");

  worker = new Worker(
    "document-analysis",
    async (job) => {
      const { fileID } = job.data;

      console.log(`Processing job ${job.id} for file ${fileID}`);
      console.log("Worker processor function started");

      if (!fileID) {
        throw new Error("Invalid or missing file ID");
      }

      console.log("About to update status to PROCESSING");

      await workerPrisma.document.update({
        where: { id: fileID },
        data: { status: "PROCESSING" },
      });

      console.log("PROCESSING status updated");


    // analyzing by calling ai function call here
    // example: await analyzeThisDocument(fileID);

      console.log("analyze this document completed");
    },
    {
      connection: bullRedisConnection as any,
    }
  );

  console.log("Worker object created");

  worker.on("ready", () => {
    console.log("WORKER READY");
  });

  worker.on("active", (job) => {
    console.log("ACTIVE JOB:", job.id);
  });

  worker.on("completed", (job) => {
    console.log(`Job ${job.id} completed successfully`);
  });

  worker.on("failed", async (job, err) => {
    
    console.error("JOB FAILED");
    console.error("Job ID:", job?.id);
    console.error("File ID:", job?.data?.fileID);
    console.error("Error Message:", err.message);
    console.error("Error Stack:", err.stack);
    

    if (job?.data?.fileID) {
      try {
        await workerPrisma.document.update({
          where: { id: job.data.fileID },
          data: { status: "FAILED" },
        });

        console.log("Updated status to FAILED");
      } catch (updateError) {
        console.error("Failed to update FAILED status:", updateError);
      }
    }
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

  console.log("BullMQ Worker started successfully");
}