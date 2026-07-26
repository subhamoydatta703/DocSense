import "dotenv/config";
import * as dotenv from "dotenv";
import * as path from "path";
import { fileURLToPath } from 'url';
dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.env'), override: true, quiet: true });
import app from "./app";
import { connectRedis } from "./config/redis/redisCaching";
import { verifyBullMQConnection } from "./config/redis/redisBullMQ";
import { startWorker } from "../src/services/worker/workerService";

const PORT = process.env.PORT || 5000;
async function startServer() {
  try {
    // Health checks for both Redis instances
    await connectRedis();
    await verifyBullMQConnection();
    await startWorker();
    console.log("Worker function called from server...")
    app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
    });
  } catch (error) {
    console.error("Server Startup Failed:", error);
    process.exit(1);
  }
}

startServer();