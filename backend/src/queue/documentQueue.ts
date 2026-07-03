import { Queue } from "bullmq";
import { bullRedisConnection } from "../../src/config/redisBullMQ";

export const DocumentQueue = new Queue(
    "document-analysis",
    {
    connection: bullRedisConnection as any,
    }
);