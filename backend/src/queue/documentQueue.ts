import { Queue } from "bullmq";
import { bullRedisConnection } from "../config/redis/redisBullMQ";

export const DocumentQueue = new Queue(
    "document-analysis",
    {
        connection: bullRedisConnection as any,
    }
);