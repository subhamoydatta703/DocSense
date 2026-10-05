import IORedis from "ioredis";
import { withDeadline } from "../../utils/deadline";

const bullmqUrlString = process.env.BULLMQ_REDIS_URL?.trim();

/**
 * Creates and configures an IORedis connection instance for BullMQ queue operations.
 */
function createBullRedisConnection(producer = false): IORedis {
  const reliability = producer
    ? { maxRetriesPerRequest: 1, enableOfflineQueue: false, commandTimeout: 10_000 }
    : { maxRetriesPerRequest: null };
  if (bullmqUrlString) {
    // Manually parse the URL to bypass IORedis string parsing quirks in Bun
    // and to safely strip any trailing whitespace from Render env vars
    const parsedUrl = new URL(bullmqUrlString);
    const useTls = parsedUrl.protocol === "rediss:";

    return new IORedis({
      host: parsedUrl.hostname,
      port: Number(parsedUrl.port) || (useTls ? 6380 : 6379),
      username: decodeURIComponent(parsedUrl.username) || "default",
      password: decodeURIComponent(parsedUrl.password),
      db: Number(parsedUrl.pathname.slice(1)) || 0,
      connectTimeout: 10_000,
      ...reliability,
      ...(useTls && { tls: { rejectUnauthorized: true, servername: parsedUrl.hostname } }),
    });
  }

  // Local development fallback
  return new IORedis({
    host: process.env.REDIS_HOST || "localhost",
    port: Number(process.env.REDIS_PORT) || 6379,
    connectTimeout: 10_000,
    ...reliability,
  });
}

export const bullRedisConnection = createBullRedisConnection();
export const queueRedisConnection = createBullRedisConnection(true);
queueRedisConnection.on("error", err => console.error("[Queue Redis Error]:", err.message));

bullRedisConnection.on("error", (err) => {
  console.error("[BullMQ Redis Error]:", err.message);
});

/**
 * Performs a health check ping against the BullMQ Redis connection on startup.
 */
export async function verifyBullMQConnection() {
  try {
    const pingResponse = await withDeadline(bullRedisConnection.ping(), 15_000, "Queue connection timed out");
    if (pingResponse !== "PONG") {
      throw new Error(`Unexpected ping response: ${pingResponse}`);
    }
    console.log("BullMQ Redis Connected & Health Check Passed");
  } catch (error: any) {
    console.error("BullMQ Redis Connection or Health Check Failed:", error.message);
    throw error;
  }
}
