import { afterAll, afterEach, beforeAll, describe, expect, mock, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";
import { Worker } from "bullmq";
import { Pool } from "pg";
import { readFile } from "node:fs/promises";

const databaseUrl = process.env.TEST_DATABASE_URL;
const redisUrl = process.env.TEST_REDIS_URL;
const integration = databaseUrl && redisUrl ? describe : describe.skip;
const deletedObjects: string[] = [];
let embeddingStarted: (() => void) | undefined;
let releaseEmbedding: (() => void) | undefined;
let blockedEmbedding: Promise<void> | undefined;
let beforeAnswer: (() => Promise<void>) | undefined;
mock.module("../src/services/storage/s3storageService", () => ({
  getFile: async () => Buffer.from("A readable source for the document processing integration test."),
  deleteFile: async (key: string) => { deletedObjects.push(key); },
}));
mock.module("../src/config/ai/ai", () => ({
  aiEmbedding: { models: { embedContent: async () => { embeddingStarted?.(); await blockedEmbedding; return { embeddings: [{ values: Array(768).fill(0.1) }] }; } } },
  aiGuard: { models: { generateContent: async () => ({ text: JSON.stringify({ safe: true, category: "SAFE", reason: "Allowed" }) }) } },
  aiQueryOptimization: { models: { generateContent: async () => ({ text: "return policy" }) } },
  ai: { models: { generateContent: async (request: { contents: string }) => {
    await beforeAnswer?.();
    const source = JSON.parse(request.contents).sources[0];
    return { text: JSON.stringify({ abstained: false, claims: [{ text: source.text, evidence: [{ chunkId: source.chunkId, quote: source.text }] }] }) };
  } } },
}));

integration("isolated PostgreSQL and Redis", () => {
  let prisma: typeof import("../src/config/db/db").prisma;
  let vectors: typeof import("../src/services/vectors/vectorService");
  let sources: typeof import("../src/services/document/saveDocumentSource");
  let queue: typeof import("../src/queue/documentQueue");
  let redis: typeof import("../src/config/redis/redisBullMQ");
  let worker: typeof import("../src/services/worker/workerService");
  let queries: typeof import("../src/services/query/queryService");
  let maintenance: typeof import("../src/services/processing/reindexUnreadableSourcesService");
  const userId = randomUUID();
  const embedding = Array(768).fill(0.1);

  beforeAll(async () => {
    const db = new URL(databaseUrl!);
    const cache = new URL(redisUrl!);
    // Refuse accidental production targets. This suite deletes only its test user's data.
    if (!["localhost", "127.0.0.1"].includes(db.hostname) || db.pathname !== "/docsense_test" ||
        !["localhost", "127.0.0.1"].includes(cache.hostname) || cache.port !== "16379") throw new Error("Integration tests require the isolated docsense_test database and Redis on port 16379.");
    process.env.DATABASE_URL = databaseUrl;
    process.env.BULLMQ_REDIS_URL = redisUrl;
    process.env.EMBEDDING_MIN_INTERVAL_MS = "0";
    ({ prisma } = await import("../src/config/db/db"));
    vectors = await import("../src/services/vectors/vectorService");
    sources = await import("../src/services/document/saveDocumentSource");
    queue = await import("../src/queue/documentQueue");
    redis = await import("../src/config/redis/redisBullMQ");
    worker = await import("../src/services/worker/workerService");
    queries = await import("../src/services/query/queryService");
    maintenance = await import("../src/services/processing/reindexUnreadableSourcesService");
    await redis.verifyBullMQConnection();
    await queue.DocumentQueue.waitUntilReady();
    await prisma.user.create({ data: { id: userId, email: `${userId}@integration.test` } });
  }, 20_000);
  afterEach(async () => {
    releaseEmbedding?.();
    embeddingStarted = undefined;
    blockedEmbedding = undefined;
    beforeAnswer = undefined;
    deletedObjects.length = 0;
    try { await queue.DocumentQueue.drain(true); }
    finally { await prisma.document.deleteMany({ where: { userId } }); }
  });
  afterAll(async () => {
    if (!prisma) return;
    await worker.stopWorker();
    await queue.DocumentQueue.close();
    redis.bullRedisConnection.disconnect();
    redis.queueRedisConnection.disconnect();
    await prisma.document.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });
  const createDocument = (status: "COMPLETED" | "PENDING" = "COMPLETED") => prisma.document.create({ data: {
    userId, s3Key: randomUUID(), fileName: "source.txt", originalName: "source.txt", sourceType: "TEXT", status,
  } });
  async function waitFor(check: () => Promise<boolean>) {
    for (let i = 0; i < 100; i++) { if (await check()) return; await sleep(50); }
    throw new Error("Integration state did not settle within five seconds.");
  }

  test("concurrent retries store one chunk per position", async () => {
    const doc = await createDocument();
    await Promise.all([
      vectors.createVector(doc.id, "first content", 0, embedding, doc.s3Key),
      vectors.createVector(doc.id, "retry content", 0, embedding, doc.s3Key),
    ]);
    expect(await prisma.documentChunk.count({ where: { documentId: doc.id } })).toBe(1);
  });
  test("pgvector retrieval succeeds without unsupported-type deserialization", async () => {
    const doc = await createDocument();
    await vectors.createVector(doc.id, "retrievable content", 0, embedding, doc.s3Key);
    const results = await vectors.searchSimilarVectors(embedding, userId, doc.id) as Array<{ content: string; distance: number }>;
    expect(results[0]?.content).toBe("retrievable content");
    expect(results[0]?.distance).toBeCloseTo(0);
    const stored = await vectors.getVectorsByDocumentId(doc.id) as Array<{ embedding: string }>;
    expect(typeof stored[0]?.embedding).toBe("string");
  });
  test("the complete query pipeline returns evidence from real owner-scoped vector retrieval", async () => {
    const doc = await createDocument();
    await vectors.createVector(doc.id, "Items can be returned within 42 days of purchase.", 0, embedding, doc.s3Key);
    const result = await queries.userQueryWithEvidence("When can I return an item?", userId, doc.id);
    expect(result.abstained).toBeFalse();
    expect(result.answer).toContain("42 days");
    expect(result.citations[0]).toMatchObject({ documentId: doc.id, chunkIndex: 0, quote: "Items can be returned within 42 days of purchase." });
    expect(JSON.stringify(result)).not.toContain(doc.s3Key);
  });
  test("query readiness and ownership are enforced using real database rows", async () => {
    const doc = await createDocument("PENDING");
    const pendingError = await queries.userQueryWithEvidence("question", userId, doc.id).then(() => null, error => error);
    expect(pendingError).toMatchObject({ status: 409 });
    const ownershipError = await queries.userQueryWithEvidence("question", randomUUID(), doc.id).then(() => null, error => error);
    expect(ownershipError).toMatchObject({ status: 404 });
  });
  test("source replacement during answer generation prevents publishing stale evidence", async () => {
    const doc = await createDocument();
    await vectors.createVector(doc.id, "Items can be returned within 42 days of purchase.", 0, embedding, doc.s3Key);
    beforeAnswer = async () => { await prisma.document.update({ where: { id: doc.id }, data: { s3Key: randomUUID(), status: "PENDING" } }); };
    const error = await queries.userQueryWithEvidence("When can I return an item?", userId, doc.id).then(() => null, error => error);
    expect(error).toMatchObject({ status: 409, stage: "source_validation" });
  });
  test("full-document summary retrieval includes ordered chunks beyond the nearest five", async () => {
    const doc = await createDocument();
    for (let i = 0; i < 7; i++) await vectors.createVector(doc.id, `Policy section ${i + 1} contains readable text.`, i, embedding, doc.s3Key);
    const chunks = await vectors.getSummaryChunks(userId, doc.id);
    expect(chunks.map(chunk => chunk.chunkIndex)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(await vectors.getSummaryChunks(randomUUID(), doc.id)).toEqual([]);
    expect((await queries.userQueryWithEvidence("Summarize this document", userId, doc.id)).abstained).toBeFalse();
  });
  test("unreadable-source cleanup is read-only by default and preserves readable sources on apply", async () => {
    const bad = await createDocument();
    const good = await createDocument();
    await vectors.createVector(bad.id, "-- 1 of 1 --", 0, embedding, bad.s3Key);
    await vectors.createVector(good.id, "Readable policy text.", 0, embedding, good.s3Key);
    expect(await maintenance.reindexUnreadableSources(false, userId)).toEqual({ affected: 1, markedPending: 0 });
    expect(await prisma.documentChunk.count({ where: { documentId: bad.id } })).toBe(1);
    expect(await maintenance.reindexUnreadableSources(true, userId)).toEqual({ affected: 1, markedPending: 1 });
    expect(await prisma.document.findUnique({ where: { id: bad.id }, select: { status: true, s3Key: true } })).toEqual({ status: "PENDING", s3Key: bad.s3Key });
    expect(await prisma.documentChunk.count({ where: { documentId: bad.id } })).toBe(0);
    expect(await prisma.document.findUnique({ where: { id: good.id }, select: { status: true, s3Key: true } })).toEqual({ status: "COMPLETED", s3Key: good.s3Key });
    expect(await prisma.documentChunk.count({ where: { documentId: good.id } })).toBe(1);
    expect(deletedObjects).toEqual([]);
  });
  test("cleanup pagination does not skip sources when earlier rows become pending", async () => {
    await prisma.document.createMany({ data: Array.from({ length: 101 }, () => ({
      id: randomUUID(), userId, s3Key: randomUUID(), fileName: "empty.txt", originalName: "empty.txt",
      sourceType: "TEXT" as const, status: "COMPLETED" as const,
    })) });
    expect(await maintenance.reindexUnreadableSources(true, userId)).toEqual({ affected: 101, markedPending: 101 });
    expect(await prisma.document.count({ where: { userId, status: "PENDING" } })).toBe(101);
  });
  test("replacement row locks reject an old write that was already waiting", async () => {
    const doc = await createDocument();
    let locked!: () => void;
    let release!: () => void;
    const acquired = new Promise<void>(resolve => { locked = resolve; });
    const released = new Promise<void>(resolve => { release = resolve; });
    const replacement = prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM "Document" WHERE id = ${doc.id} FOR UPDATE`;
      locked();
      await released;
      await tx.document.update({ where: { id: doc.id }, data: { s3Key: "replacement", status: "PENDING" } });
    });
    await acquired;
    const oldWrite = vectors.createVector(doc.id, "stale content", 0, embedding, doc.s3Key).then(() => null, error => error);
    try { await sleep(50); } finally { release(); }
    await replacement;
    expect(await oldWrite).toMatchObject({ message: "Document was replaced or deleted while processing." });
    expect(await prisma.documentChunk.count({ where: { documentId: doc.id } })).toBe(0);
  });
  test("deletion cascades chunks and rejects a later stale write", async () => {
    const doc = await createDocument();
    await vectors.createVector(doc.id, "content", 0, embedding, doc.s3Key);
    await prisma.document.delete({ where: { id: doc.id } });
    const error = await vectors.createVector(doc.id, "stale content", 0, embedding, doc.s3Key).then(() => null, error => error);
    expect(error).toMatchObject({ message: "Document was replaced or deleted while processing." });
    expect(await prisma.documentChunk.count({ where: { documentId: doc.id } })).toBe(0);
  });
  test("simultaneous source uploads serialize to one document", async () => {
    const base = { fileName: "source.txt", originalName: "source.txt", userId, sourceType: "TEXT" as const };
    const saved = await Promise.all([sources.saveDocumentSource({ ...base, s3Key: "upload-a" }), sources.saveDocumentSource({ ...base, s3Key: "upload-b" })]);
    expect(saved[0].Document.id).toBe(saved[1].Document.id);
    expect(await prisma.document.count({ where: { userId } })).toBe(1);
    expect(deletedObjects).toHaveLength(1);
  });
  test("durable pending rows recover into real BullMQ jobs", async () => {
    const doc = await createDocument("PENDING");
    await queue.recoverUnqueuedDocuments();
    const job = await queue.DocumentQueue.getJob(queue.documentJobId(doc.id, doc.s3Key));
    expect(job?.data).toMatchObject({ documentId: doc.id, s3Key: doc.s3Key });
    expect(job?.opts.attempts).toBe(3);
  });
  test("a real Redis outage leaves a saved document recoverable", async () => {
    const doc = await createDocument("PENDING");
    redis.queueRedisConnection.disconnect();
    await waitFor(async () => redis.queueRedisConnection.status === "end");
    try { expect(await queue.enqueueDocument(doc)).toBeNull(); }
    finally { await redis.queueRedisConnection.connect(); }
    await queue.recoverUnqueuedDocuments();
    expect(await queue.DocumentQueue.getJob(queue.documentJobId(doc.id, doc.s3Key))).not.toBeNull();
  });
  test("migration reindexes duplicate documents and preserves unaffected chunks", async () => {
    const pool = new Pool({ connectionString: databaseUrl });
    const client = await pool.connect();
    const schema = `docsense_migration_${randomUUID().replaceAll("-", "")}`;
    try {
      await client.query(`CREATE SCHEMA "${schema}"`);
      await client.query(`SET search_path TO "${schema}", public`);
      await client.query('CREATE TABLE "Document" (LIKE public."Document" INCLUDING DEFAULTS)');
      await client.query('CREATE TABLE "DocumentChunk" (LIKE public."DocumentChunk" INCLUDING DEFAULTS)');
      await client.query(`INSERT INTO "Document" (id, "fileName", "originalName", "s3Key", status, "userId", "updatedAt") VALUES ('duplicate', 'a', 'a', 'a', 'COMPLETED', 'test', NOW()), ('unaffected', 'b', 'b', 'b', 'COMPLETED', 'test', NOW())`);
      const vector = `[${embedding.join(",")}]`;
      await client.query('INSERT INTO "DocumentChunk" (id, "documentId", content, "chunkIndex", embedding) VALUES ($1, $2, $3, 0, $4::vector)', ["old-a", "duplicate", "old", vector]);
      await client.query('INSERT INTO "DocumentChunk" (id, "documentId", content, "chunkIndex", embedding) VALUES ($1, $2, $3, 0, $4::vector)', ["old-b", "duplicate", "duplicate", vector]);
      await client.query('INSERT INTO "DocumentChunk" (id, "documentId", content, "chunkIndex", embedding) VALUES ($1, $2, $3, 0, $4::vector)', ["good", "unaffected", "preserved", vector]);
      await client.query(await readFile(new URL("../prisma/migrations/20261005120000_idempotent_chunks/migration.sql", import.meta.url), "utf8"));
      const docs = await client.query('SELECT id, status FROM "Document" ORDER BY id');
      expect(docs.rows).toEqual([{ id: "duplicate", status: "PENDING" }, { id: "unaffected", status: "COMPLETED" }]);
      const remaining = await client.query('SELECT content FROM "DocumentChunk"');
      expect(remaining.rows).toEqual([{ content: "preserved" }]);
      const error = await client.query('INSERT INTO "DocumentChunk" (id, "documentId", content, "chunkIndex", embedding) VALUES ($1, $2, $3, 0, $4::vector)', ["duplicate-good", "unaffected", "duplicate", vector]).then(() => null, error => error);
      expect(error?.code).toBe("23505");
    } finally {
      await client.query("ROLLBACK");
      await client.query("SET search_path TO public");
      await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      client.release();
      await pool.end();
    }
  });
  test("actual BullMQ retries honor the configured attempt count", async () => {
    let attempts = 0;
    const retryWorker = new Worker("document-analysis", async () => { if (++attempts < 3) throw new Error("transient test failure"); }, { connection: redis.bullRedisConnection as never });
    retryWorker.on("error", () => {});
    try {
      const doc = await createDocument("PENDING");
      const job = await queue.DocumentQueue.add("document-analysis", { documentId: doc.id, s3Key: doc.s3Key }, { backoff: { type: "exponential", delay: 100 } });
      await waitFor(async () => await job.getState() === "completed");
      expect(attempts).toBe(3);
    } finally { await retryWorker.close(); }
  });
  test("a real processing worker cannot overwrite a replacement during embedding", async () => {
    const doc = await createDocument("PENDING");
    const started = new Promise<void>(resolve => { embeddingStarted = resolve; });
    blockedEmbedding = new Promise<void>(resolve => { releaseEmbedding = resolve; });
    await worker.startWorker();
    const job = await queue.enqueueDocument(doc);
    await started;
    const replacement = await sources.saveDocumentSource({ userId, fileName: "source.txt", originalName: "source.txt", sourceType: "TEXT", s3Key: "replacement-source" });
    releaseEmbedding!();
    await waitFor(async () => await job!.getState() === "completed");
    const current = await prisma.document.findUnique({ where: { id: doc.id } });
    expect(current?.s3Key).toBe(replacement.Document.s3Key);
    expect(current?.status).toBe("PENDING");
    expect(await prisma.documentChunk.count({ where: { documentId: doc.id } })).toBe(0);
    await worker.stopWorker();
  });
});
