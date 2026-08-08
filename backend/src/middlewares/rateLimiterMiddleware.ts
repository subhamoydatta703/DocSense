import type { Response, NextFunction } from "express";
import type { AuthenticatedRequest } from "./authMiddleware";
import { redisClient } from "../../src/config/redis/redisCaching";

export const rateLimiter = async (req:AuthenticatedRequest, res: Response, next: NextFunction) => {
    
    const key = `rate_limit:${req.method}:${req.path}:${req.userId || req.ip}`;
    try {
        const count: number | null = await redisClient.incr(key);
        if(count == 1){
            await redisClient.expire(key, 60);
        }
        if(count > 20){
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
