import IORedis from "ioredis";

const bullmqUrlString = process.env.BULLMQ_REDIS_URL?.trim();

function createBullRedisConnection(): IORedis {
  if (bullmqUrlString) {
    // Manually parse the URL to bypass IORedis string parsing quirks in Bun
    // and to safely strip any trailing whitespace from Render env vars
    const parsedUrl = new URL(bullmqUrlString);
    const useTls = parsedUrl.protocol === "rediss:";

    return new IORedis({
      host: parsedUrl.hostname,
      port: Number(parsedUrl.port) || (useTls ? 6380 : 6379),
      username: parsedUrl.username || "default",
      password: parsedUrl.password,
      maxRetriesPerRequest: null,
      ...(useTls && { tls: { rejectUnauthorized: false } }), // Upstash often requires rejectUnauthorized: false depending on the certificate chain
    });
  }

  // Local development fallback
  return new IORedis({
    host: process.env.REDIS_HOST || "localhost",
    port: Number(process.env.REDIS_PORT) || 6379,
    maxRetriesPerRequest: null,
  });
}

export const bullRedisConnection = createBullRedisConnection();

bullRedisConnection.on("error", (err) => {
  console.error("[BullMQ Redis Error]:", err.message);
});

// Startup health check
export async function verifyBullMQConnection() {
  try {
    const pingResponse = await bullRedisConnection.ping();
    if (pingResponse !== "PONG") {
      throw new Error(`Unexpected ping response: ${pingResponse}`);
    }
    console.log("BullMQ Redis Connected & Health Check Passed");
  } catch (error: any) {
    console.error("BullMQ Redis Connection or Health Check Failed:", error.message);
    process.exit(1); // Fail fast so Render can restart the service
  }
}