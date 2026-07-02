import { createClient } from "redis";

// Trim whitespace which often causes DNS/ENOTFOUND errors when copying from Render/Upstash dashboards
const cacheUrlString = process.env.REDIS_URL?.trim() || 
  `redis://${process.env.REDIS_HOST || "localhost"}:${process.env.REDIS_PORT || "6379"}`;

const useTls = cacheUrlString.startsWith("rediss:");

export const redisClient = createClient({
  url: cacheUrlString,
  ...(useTls && {
    socket: {
      tls: true,
      rejectUnauthorized: false, // Often required for Upstash Valkey depending on the root CA
    },
  }),
});

redisClient.on("error", (err) => {
  console.error("[Cache Redis Error]:", err.message);
});

export async function connectRedis() {
  console.log("Redis is connecting... ", );
  
  try {
    await redisClient.connect();
    
    // Startup health check
    const pingResponse = await redisClient.ping();
    if (pingResponse !== "PONG") {
      throw new Error(`Unexpected ping response: ${pingResponse}`);
    }
    
    console.log("Cache Redis Connected & Health Check Passed");
  } catch (error: any) {
    console.error("Cache Redis Connection or Health Check Failed:", error.message);
    process.exit(1); // Fail fast so Render can restart the service
  }
}