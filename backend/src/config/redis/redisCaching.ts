import { createClient } from "redis";
import { withDeadline } from "../../utils/deadline";

// Trim whitespace which often causes DNS/ENOTFOUND errors when copying from Render/Upstash dashboards
const cacheUrlString = process.env.REDIS_URL?.trim() || 
  `redis://${process.env.REDIS_HOST || "localhost"}:${process.env.REDIS_PORT || "6379"}`;

const useTls = cacheUrlString.startsWith("rediss:");

export const redisClient = createClient({
  url: cacheUrlString,
  disableOfflineQueue: true,
  socket: { connectTimeout: 10_000 },
  ...(useTls && {
    socket: {
      tls: true,
      connectTimeout: 10_000,
      rejectUnauthorized: true,
      servername: new URL(cacheUrlString).hostname,
    },
  }),
});

redisClient.on("error", (err) => {
  console.error("[Cache Redis Error]:", err.message);
});

/**
 * Connects the main Redis client for rate-limiting and caching and performs a startup health check.
 */
export async function connectRedis() {
  console.log("Redis is connecting... ", );
  
  try {
    if (!redisClient.isOpen) await withDeadline(redisClient.connect(), 15_000, "Cache connection timed out");
    if (!redisClient.isReady) throw new Error("Cache connection is not ready");
    
    // Startup health check
    const pingResponse = await withDeadline(redisClient.ping(), 5_000, "Cache ping timed out");
    if (pingResponse !== "PONG") {
      throw new Error(`Unexpected ping response: ${pingResponse}`);
    }
    
    console.log("Cache Redis Connected & Health Check Passed");
  } catch (error: any) {
    console.error("Cache Redis Connection or Health Check Failed:", error.message);
    throw error;
  }
}
