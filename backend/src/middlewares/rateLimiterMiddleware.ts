import type { Response, NextFunction } from "express";
import type { AuthenticatedRequest } from "./authMiddleware";
import { redisClient } from "../../src/config/redis/redisCaching";
import { withDeadline } from "../utils/deadline";

/**
 * Enforces fixed-window Redis rate limits (max 20 requests per 60 seconds per user/IP).
 */
export const rateLimiter = async (req:AuthenticatedRequest, res: Response, next: NextFunction) => {
    
    const key = `rate_limit:${req.method}:${req.path}:${req.userId || req.ip}`;
    try {
        // Increment and expiry must be atomic, including repair of old counters without TTL.
        const result = await withDeadline(redisClient.eval(`
            local count = redis.call('INCR', KEYS[1])
            if redis.call('TTL', KEYS[1]) < 0 then redis.call('EXPIRE', KEYS[1], 60) end
            return { count, redis.call('TTL', KEYS[1]) }
        `, { keys: [key], arguments: [] }), 3_000, "Rate limiter timed out") as number[];
        const count = Number(result[0]);
        if(count > 20){
            res.set("Retry-After", String(Math.max(1, Number(result[1]) || 60)));
            return res.status(429).json({
                success: false,
                message: "Too many requests. Please try again later"
            })
        }
        next();
    } catch (error) {
        console.error("Rate Limiter Error:", error);
        return res.status(503).json({
            success: false,
            message: "Request protection is temporarily unavailable. Please try again shortly.",
        });
    }
}
