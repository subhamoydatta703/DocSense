import { Queue } from "bullmq";
import { queueRedisConnection } from "../config/redis/redisBullMQ";
import { createHash } from "node:crypto";
import { prisma } from "../config/db/db";
import { withDeadline } from "../utils/deadline";

export const DocumentQueue = new Queue(
    "document-analysis",
    {
        connection: queueRedisConnection as any,
        defaultJobOptions: {
            attempts: 3,
            backoff: { type: "exponential", delay: 10_000 },
            removeOnComplete: { age: 86_400, count: 1000 },
            removeOnFail: { age: 604_800, count: 1000 },
        },
    }
);

export function documentJobId(documentId: string, s3Key: string) {
    return `${documentId}-${createHash("sha256").update(s3Key).digest("hex").slice(0, 24)}`;
}

/** A committed PENDING row is durable intent; recovery retries enqueue after Redis outages. */
export async function enqueueDocument(document: { id: string; s3Key: string }) {
    try {
        if (queueRedisConnection.status !== "ready") throw new Error("Queue connection is unavailable");
        return await withDeadline(DocumentQueue.add("document-analysis", {
            documentId: document.id, s3Key: document.s3Key,
        }, { jobId: documentJobId(document.id, document.s3Key) }), 12_000, "Queue submission timed out");
    } catch {
        console.warn("Document saved; queue submission will be retried", { documentId: document.id });
        return null;
    }
}

let recoveryTimer: ReturnType<typeof setTimeout> | undefined;
let stopped = true;
export async function recoverUnqueuedDocuments() {
    if (queueRedisConnection.status !== "ready") return;
    let cursor: string | undefined;
    while (queueRedisConnection.status === "ready") {
    const documents = await prisma.document.findMany({
        where: { status: { in: ["PENDING", "PROCESSING"] } },
        orderBy: { id: "asc" }, take: 100,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        select: { id: true, s3Key: true },
    });
    for (const document of documents) {
        const existing = await DocumentQueue.getJob(documentJobId(document.id, document.s3Key));
        if (!existing) { await enqueueDocument(document); continue; }
        const state = await existing.getState();
        if (state === "failed") {
            await prisma.document.updateMany({ where: { id: document.id, s3Key: document.s3Key, status: { in: ["PENDING", "PROCESSING"] } }, data: { status: "FAILED", failureReason: "Processing could not finish after retries. Please upload the source again." } });
        } else if (state === "completed") {
            const current = await prisma.document.findUnique({ where: { id: document.id }, select: { s3Key: true, status: true } });
            if (!current || current.s3Key !== document.s3Key || current.status === "COMPLETED" || current.status === "FAILED") continue;
            // Never overwrite a replacement or report a completed job with unfinished data as ready.
            await existing.remove();
            await enqueueDocument(document);
        }
    }
    if (documents.length < 100) break;
    cursor = documents.at(-1)!.id;
    }
}

export function startQueueRecovery() {
    if (!stopped) return;
    stopped = false;
    const tick = async () => {
        try { await recoverUnqueuedDocuments(); }
        catch { console.error("Document queue recovery failed; will retry"); }
        if (!stopped) recoveryTimer = setTimeout(tick, 30_000);
    };
    void tick();
}
export function stopQueueRecovery() { stopped = true; clearTimeout(recoveryTimer); }
