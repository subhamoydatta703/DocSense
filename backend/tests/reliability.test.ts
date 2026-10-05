import { afterAll, afterEach, beforeAll, beforeEach, expect, mock, test } from "bun:test";
import { UnrecoverableError } from "bullmq";

// No test connects to the application's configured database, Redis, S3, or AI accounts.
process.env.EMBEDDING_MIN_INTERVAL_MS = "0";
process.env.SUPADATA_API_KEY = "test-only";
const realFetch = globalThis.fetch;
let source: { id: string; s3Key: string; sourceType: string; status: string; userId: string } | null;
let chunks: string[];
const rawQuery = mock(async (..._args: unknown[]) => [] as unknown[]);
const rawExecute = mock(async (..._args: unknown[]) => 1);
const updateMany = mock(async (_args: unknown) => ({ count: 1 }));
const transaction = mock(async (operation: (tx: unknown) => Promise<unknown>) => operation(tx));
const tx = {
  $queryRaw: mock(async (..._args: unknown[]) => source ? [{ id: source.id, s3Key: source.s3Key }] : []),
  $executeRaw: rawExecute,
  document: {
    findFirst: mock(async (_args: unknown) => source),
    create: mock(async ({ data }: { data: object }) => ({ ...data, id: "new-document", status: "PENDING" })),
    update: mock(async ({ data }: { data: object }) => ({ ...source, ...data })),
    delete: mock(async (_args: unknown) => source),
  },
  documentChunk: { deleteMany: mock(async (_args: unknown) => ({ count: 1 })) },
};
const prisma = {
  $queryRaw: rawQuery, $executeRaw: rawExecute, $transaction: transaction,
  document: {
    findUnique: mock(async (_args: unknown) => source),
    findFirst: mock(async (_args: unknown) => source),
    findMany: mock(async (_args: unknown) => source ? [source] : []),
    updateMany,
  },
};
mock.module("../src/config/db/db", () => ({ prisma }));
const deleteFile = mock(async (_key: string) => undefined);
mock.module("../src/services/storage/s3storageService", () => ({ deleteFile, uploadFile: async (_buffer: Buffer, key: string) => key, getFile: async () => Buffer.from("readable document text") }));
mock.module("../src/services/processing/chunkService", () => ({ createChunks: async () => chunks }));

const generateContent = mock(async (_args: unknown) => ({ text: "A valid answer." }));
const guardContent = mock(async (_args: unknown) => ({ text: '{"safe":true,"category":"SAFE","reason":"Allowed"}' }));
const optimizeContent = mock(async (_args: unknown) => ({ text: "optimized question" }));
const embedContent = mock(async (_args: unknown) => ({ embeddings: [{ values: Array(768).fill(0.1) }] }));
const upload = mock(async (_args: unknown) => ({ name: "files/test", uri: "gs://test", mimeType: "video/mp4", state: "ACTIVE" }));
const getFile = mock(async (_args: unknown) => ({ name: "files/test", uri: "gs://test", mimeType: "video/mp4", state: "ACTIVE" }));
const deleteMedia = mock(async (_args: unknown) => undefined);
mock.module("../src/config/ai/ai", () => ({
  ai: { models: { generateContent }, files: { upload, get: getFile, delete: deleteMedia } },
  aiEmbedding: { models: { embedContent } }, aiGuard: { models: { generateContent: guardContent } }, aiQueryOptimization: { models: { generateContent: optimizeContent } },
}));

type FakeJob = { data: { documentId: string; s3Key?: string }; attemptsMade: number; opts: { attempts?: number } };
let processJob: (job: FakeJob) => Promise<unknown>;
const queueAdd = mock(async (_name: string, _data: unknown, _opts: unknown) => ({ id: "queued-job" }));
const getJob = mock(async (_id: string): Promise<unknown> => null);
let queueOptions: Record<string, unknown>;
class FakeQueue {
  constructor(_name: string, options: Record<string, unknown>) { queueOptions = options; }
  add = queueAdd;
  getJob = getJob;
}
class FakeWorker {
  constructor(_name: string, processor: typeof processJob) { processJob = processor; }
  on() {}
  async waitUntilReady() {}
  isRunning() { return true; }
  async close() {}
}
mock.module("bullmq", () => ({ Queue: FakeQueue, Worker: FakeWorker, UnrecoverableError }));
const queueRedis = { status: "ready", ping: async () => "PONG", set: async () => "OK", get: async () => "ready" };
mock.module("../src/config/redis/redisBullMQ", () => ({ queueRedisConnection: queueRedis, bullRedisConnection: queueRedis }));
const evalLimit = mock(async (..._args: unknown[]) => [1, 60]);
mock.module("../src/config/redis/redisCaching", () => ({ redisClient: { isReady: true, ping: async () => "PONG", eval: evalLimit } }));

const { createVector, searchSimilarVectors } = await import("../src/services/vectors/vectorService");
const { processDocumentService } = await import("../src/services/processing/processDocumentService");
const { saveDocumentSource } = await import("../src/services/document/saveDocumentSource");
const { enqueueDocument, recoverUnqueuedDocuments, documentJobId } = await import("../src/queue/documentQueue");
const { startWorker, stopWorker } = await import("../src/services/worker/workerService");
const { getSupadataTranscript } = await import("../src/services/youtube/supadataTranscriptService");
const { transcribeUploadedMedia } = await import("../src/services/youtube/mediaTranscriptionService");
const { inputGuardrail } = await import("../src/guardrails/input/inputGuard");
const { parseGuardrailResponse, inputCategories } = await import("../src/guardrails/guardrailSchema");
const { createEmbeddings } = await import("../src/services/processing/embeddingService");
const { userQueryService } = await import("../src/services/query/queryService");
const { rateLimiter } = await import("../src/middlewares/rateLimiterMiddleware");

beforeEach(() => {
  source = { id: "document", s3Key: "new-upload", sourceType: "PDF", status: "COMPLETED", userId: "user" };
  chunks = ["first chunk", "second chunk"];
  for (const fn of [rawQuery, rawExecute, updateMany, transaction, deleteFile, generateContent, guardContent, optimizeContent, embedContent, upload, getFile, deleteMedia, queueAdd, getJob, tx.$queryRaw, tx.documentChunk.deleteMany, tx.document.update, prisma.document.findMany]) fn.mockClear();
  prisma.document.findMany.mockImplementation(async () => source ? [source] : []);
  rawQuery.mockImplementation(async () => []);
  updateMany.mockImplementation(async () => ({ count: 1 }));
  generateContent.mockImplementation(async () => ({ text: "A valid answer." }));
  guardContent.mockImplementation(async () => ({ text: '{"safe":true,"category":"SAFE","reason":"Allowed"}' }));
  optimizeContent.mockImplementation(async () => ({ text: "optimized question" }));
  embedContent.mockImplementation(async () => ({ embeddings: [{ values: Array(768).fill(0.1) }] }));
  upload.mockImplementation(async () => ({ name: "files/test", uri: "gs://test", mimeType: "video/mp4", state: "ACTIVE" }));
  getFile.mockImplementation(async () => ({ name: "files/test", uri: "gs://test", mimeType: "video/mp4", state: "ACTIVE" }));
  queueAdd.mockImplementation(async () => ({ id: "queued-job" }));
  getJob.mockImplementation(async () => null);
  evalLimit.mockImplementation(async () => [1, 60]);
  queueRedis.status = "ready";
});
afterEach(() => { globalThis.fetch = realFetch; });
afterAll(async () => { await stopWorker(); });

test("replacement and deletion prevent stale chunk writes", async () => {
  await expect(createVector("document", "stale content", 0, [0.1], "old-upload")).rejects.toThrow("replaced or deleted");
  source = null;
  await expect(createVector("document", "deleted content", 0, [0.1], "new-upload")).rejects.toThrow("replaced or deleted");
  expect(rawExecute).not.toHaveBeenCalled();
});
test("current chunk writes lock the source and use an idempotent upsert", async () => {
  await createVector("document", "content", 0, [0.1], "new-upload");
  expect(tx.$queryRaw.mock.calls[0]![0]!.toString()).toContain("FOR UPDATE");
  expect(rawExecute.mock.calls[0]![0]!.toString()).toContain("ON CONFLICT");
});
test("retrieval excludes unsupported embedding columns and incomplete documents", async () => {
  await searchSimilarVectors([0.1], "user", "document");
  await searchSimilarVectors([0.1], "user");
  for (const call of rawQuery.mock.calls) {
    const sql = String(call[0]);
    expect(sql).not.toContain("dc.*");
    expect(sql).toContain("COMPLETED");
  }
});
test("stale processing jobs stop before extracting or embedding content", async () => {
  await expect(processDocumentService("document", "old-upload")).rejects.toThrow("replaced or deleted");
  expect(embedContent).not.toHaveBeenCalled();
  expect(updateMany).not.toHaveBeenCalled();
});
test("empty documents never become completed", async () => {
  chunks = [];
  await expect(processDocumentService("document", "new-upload")).rejects.toBeInstanceOf(UnrecoverableError);
  expect(updateMany).toHaveBeenCalledTimes(1);
});
test("a transient embedding failure never marks a partial document completed", async () => {
  embedContent.mockRejectedValueOnce(new Error("temporary failure"));
  await expect(processDocumentService("document", "new-upload")).rejects.toThrow("temporary failure");
  expect(updateMany).toHaveBeenCalledTimes(1);
});
test("replacements clear chunks inside the transaction and clean old storage afterwards", async () => {
  const saved = await saveDocumentSource({ s3Key: "replacement", fileName: "file.pdf", originalName: "file.pdf", userId: "user", sourceType: "PDF" });
  expect(tx.documentChunk.deleteMany).toHaveBeenCalledTimes(1);
  expect(saved.Document.s3Key).toBe("replacement");
  expect(saved.Document.status).toBe("PENDING");
  expect(deleteFile).toHaveBeenCalledWith("new-upload");
});
test("failed source transactions clean the new object, never the old source", async () => {
  transaction.mockRejectedValueOnce(new Error("transaction failed"));
  await expect(saveDocumentSource({ s3Key: "replacement", fileName: "file.pdf", originalName: "file.pdf", userId: "user", sourceType: "PDF" })).rejects.toThrow("transaction failed");
  expect(deleteFile).toHaveBeenCalledWith("replacement");
  expect(deleteFile).not.toHaveBeenCalledWith("new-upload");
});
test("queue jobs have bounded retry and a distinct ID per upload", async () => {
  await enqueueDocument(source!);
  expect(queueOptions.defaultJobOptions).toMatchObject({ attempts: 3, backoff: { type: "exponential", delay: 10_000 } });
  expect(documentJobId("document", "old")).not.toBe(documentJobId("document", "new"));
  expect(queueAdd.mock.calls[0]![1]).toEqual({ documentId: "document", s3Key: "new-upload" });
});
test("saved uploads survive a disconnected queue without pretending processing started", async () => {
  queueRedis.status = "reconnecting";
  expect(await enqueueDocument(source!)).toBeNull();
  expect(queueAdd).not.toHaveBeenCalled();
});
test("recovery enqueues saved documents that have no job", async () => {
  await recoverUnqueuedDocuments();
  expect(queueAdd).toHaveBeenCalledTimes(1);
});
test("recovery does not duplicate an active job", async () => {
  getJob.mockResolvedValueOnce({ getState: async () => "active" });
  await recoverUnqueuedDocuments();
  expect(queueAdd).not.toHaveBeenCalled();
});
test("recovery reconciles terminal failures against the same source version", async () => {
  getJob.mockResolvedValueOnce({ getState: async () => "failed" });
  await recoverUnqueuedDocuments();
  expect(updateMany.mock.calls[0]![0]).toMatchObject({ where: { id: "document", s3Key: "new-upload" }, data: { status: "FAILED" } });
});
test("recovery reaches unqueued documents beyond the first 100 active jobs", async () => {
  const activeDocuments = Array.from({ length: 100 }, (_, index) => ({ ...source!, id: `active-${index}` }));
  prisma.document.findMany.mockResolvedValueOnce(activeDocuments).mockResolvedValueOnce([{ ...source!, id: "unqueued" }]);
  getJob.mockImplementation(async id => id.startsWith("active-") ? { getState: async () => "active" } : null);
  await recoverUnqueuedDocuments();
  expect(queueAdd).toHaveBeenCalledTimes(1);
  expect(queueAdd.mock.calls[0]![1]).toMatchObject({ documentId: "unqueued" });
  expect(prisma.document.findMany.mock.calls[1]![0]).toMatchObject({ cursor: { id: "active-99" }, skip: 1 });
});
test("recovery does not requeue a document completed after its snapshot was read", async () => {
  const remove = mock();
  getJob.mockResolvedValueOnce({ getState: async () => "completed", remove });
  await recoverUnqueuedDocuments();
  expect(remove).not.toHaveBeenCalled();
  expect(queueAdd).not.toHaveBeenCalled();
});
test("worker keeps transient failures retryable until the final attempt", async () => {
  await startWorker();
  const job = { data: { documentId: "document", s3Key: "new-upload" }, attemptsMade: 0, opts: { attempts: 3 } };
  embedContent.mockRejectedValueOnce(new Error("temporary failure"));
  await expect(processJob(job)).rejects.toThrow("temporary failure");
  expect(updateMany.mock.calls.some(call => (call[0] as { data: { status: string } }).data.status === "FAILED")).toBeFalse();
  updateMany.mockClear();
  embedContent.mockRejectedValueOnce(new Error("temporary failure"));
  await expect(processJob({ ...job, attemptsMade: 2 })).rejects.toThrow("temporary failure");
  expect(updateMany.mock.calls.at(-1)![0]).toMatchObject({ where: { s3Key: "new-upload" }, data: { status: "FAILED" } });
});
test("worker discards an old-source job without changing replacement status", async () => {
  await startWorker();
  await processJob({ data: { documentId: "document", s3Key: "old-upload" }, attemptsMade: 2, opts: { attempts: 3 } });
  expect(updateMany).not.toHaveBeenCalled();
});
test("Supadata accepts synchronous segment and text responses", async () => {
  globalThis.fetch = mock(async () => Response.json({ content: [{ text: " first " }, { text: "second" }] })) as unknown as typeof fetch;
  expect(await getSupadataTranscript("https://youtube.com/watch?v=test")).toBe("first second");
  globalThis.fetch = mock(async () => Response.json({ content: " plain transcript " })) as unknown as typeof fetch;
  expect(await getSupadataTranscript("https://youtube.com/watch?v=test")).toBe("plain transcript");
});
test("Supadata polls 202 jobs through active to a nested completed result", async () => {
  const responses = [Response.json({ jobId: "job/test" }, { status: 202 }), Response.json({ status: "active" }), Response.json({ status: "completed", result: { content: "finished transcript" } })];
const fetchMock = mock(async (_input: unknown) => responses.shift()!);
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  expect(await getSupadataTranscript("https://youtube.com/watch?v=test")).toBe("finished transcript");
  expect(String(fetchMock.mock.calls[1]![0])).toContain("/transcript/job%2Ftest");
}, 10_000);
test("Supadata failed jobs and provider rate limits stay errors", async () => {
  const responses = [Response.json({ jobId: "job" }, { status: 202 }), Response.json({ status: "failed" })];
  globalThis.fetch = mock(async () => responses.shift()!) as unknown as typeof fetch;
  await expect(getSupadataTranscript("https://youtube.com/watch?v=test")).rejects.toMatchObject({ status: 422 });
  globalThis.fetch = mock(async () => Response.json({}, { status: 429 })) as unknown as typeof fetch;
  await expect(getSupadataTranscript("https://youtube.com/watch?v=test")).rejects.toMatchObject({ status: 429 });
});
test("Gemini waits for an active media file before generating a transcript", async () => {
  upload.mockResolvedValueOnce({ name: "files/test", uri: "gs://test", mimeType: "video/mp4", state: "PROCESSING" });
  getFile.mockImplementationOnce(async () => { expect(generateContent).not.toHaveBeenCalled(); return { name: "files/test", uri: "gs://test", mimeType: "video/mp4", state: "ACTIVE" }; });
  expect(await transcribeUploadedMedia(Buffer.from("test"), "video/mp4", "test.mp4")).toBe("A valid answer.");
  expect(getFile).toHaveBeenCalledTimes(1);
  expect(deleteMedia).toHaveBeenCalledTimes(1);
});
test("Gemini failed media is cleaned up and never sent to generation", async () => {
  upload.mockResolvedValueOnce({ name: "files/test", uri: "gs://test", mimeType: "video/mp4", state: "FAILED" });
  await expect(transcribeUploadedMedia(Buffer.from("test"), "video/mp4", "test.mp4")).rejects.toThrow("could not process");
  expect(generateContent).not.toHaveBeenCalled();
  expect(deleteMedia).toHaveBeenCalledTimes(1);
});
test("guardrails reject malformed, incorrectly typed, and contradictory classifications", () => {
  for (const text of ['not json', '{"safe":"true","category":"SAFE","reason":"ok"}', '{"safe":true,"category":"JAILBREAK","reason":"ok"}']) {
    expect(() => parseGuardrailResponse(text, inputCategories)).toThrow();
  }
});
test("guardrails request JSON with a schema and an abort signal", async () => {
  await inputGuardrail("What does the document say?");
  expect(guardContent.mock.calls[0]![0]).toMatchObject({ config: { responseMimeType: "application/json", responseJsonSchema: { required: ["safe", "category", "reason"] } } });
});
test("invalid vector dimensions are rejected before database storage", async () => {
  embedContent.mockResolvedValueOnce({ embeddings: [{ values: [0.1] }] });
  await expect(createEmbeddings("text")).rejects.toThrow("invalid 768-dimensional vector");
});
test("cancelled embedding requests do not reach the provider", async () => {
  await expect(createEmbeddings("text", AbortSignal.abort())).rejects.toThrow();
  expect(embedContent).not.toHaveBeenCalled();
});
test("questions about unfinished documents stop before any AI calls", async () => {
  source!.status = "PROCESSING";
  await expect(userQueryService("question", "user", "document")).rejects.toMatchObject({ status: 409 });
  expect(guardContent).not.toHaveBeenCalled();
});
test("optimization outages fall back to original-question retrieval", async () => {
  optimizeContent.mockRejectedValueOnce(new Error("provider unavailable"));
  rawQuery.mockResolvedValueOnce([{ id: "chunk", content: "context", documentName: "file", distance: 0.1 }]);
  expect(await userQueryService("original question", "user", "document")).toBe("A valid answer.");
  expect(embedContent.mock.calls[0]![0]).toMatchObject({ contents: "original question" });
});
test("rate limits expose retry time and fail closed when Redis is unavailable", async () => {
  const response = { set: mock(), status: mock((_status: number) => response), json: mock() };
  const next = mock();
  evalLimit.mockResolvedValueOnce([21, 42]);
  await rateLimiter({ method: "GET", path: "/documents", userId: "user" } as never, response as never, next);
  expect(response.status).toHaveBeenCalledWith(429);
  expect(response.set).toHaveBeenCalledWith("Retry-After", "42");
  expect(next).not.toHaveBeenCalled();
  evalLimit.mockRejectedValueOnce(new Error("offline"));
  await rateLimiter({ method: "GET", path: "/documents", userId: "user" } as never, response as never, next);
  expect(response.status).toHaveBeenCalledWith(503);
});

// Exercise real Express parsing and Multer limits through a local HTTP listener.
mock.module("@clerk/express", () => ({ clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next() }));
mock.module("../src/middlewares/authMiddleware", () => ({ authMiddleware: (req: { userId?: string }, _res: unknown, next: () => void) => { req.userId = "user"; next(); } }));
const { default: app } = await import("../src/app");
let httpServer: ReturnType<typeof app.listen>;
let baseUrl: string;
beforeAll(async () => {
  httpServer = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => httpServer.once("listening", resolve));
  const address = httpServer.address();
  if (!address || typeof address === "string") throw new Error("HTTP test listener unavailable");
  baseUrl = `http://127.0.0.1:${address.port}`;
});
afterAll(async () => { httpServer.closeAllConnections(); await new Promise<void>(resolve => httpServer.close(() => resolve())); });

test("large pasted text within the advertised character limit is accepted", async () => {
  const response = await realFetch(`${baseUrl}/api/text`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Large source", text: "\u0001".repeat(500_000) }) });
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ success: true });
});
test("oversized and malformed JSON get clear JSON errors", async () => {
  const oversized = await realFetch(`${baseUrl}/api/text`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Too big", text: "x".repeat(4 * 1024 * 1024) }) });
  expect(oversized.status).toBe(413);
  expect(await oversized.json()).toMatchObject({ success: false, message: "Request body exceeds the 4 MB limit." });
  const malformed = await realFetch(`${baseUrl}/api/text`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{" });
  expect(malformed.status).toBe(400);
  expect(await malformed.json()).toMatchObject({ success: false });
});
test("media over the former 25 MB limit reaches transcription", async () => {
  generateContent.mockResolvedValueOnce({ text: "A sufficiently long transcript for indexing." });
  const media = new Uint8Array(26 * 1024 * 1024);
  media.set(new TextEncoder().encode("ftyp"), 4);
  const form = new FormData();
  form.append("media", new Blob([media], { type: "video/mp4" }), "test.mp4");
  const response = await realFetch(`${baseUrl}/api/youtube/media-upload`, { method: "POST", body: form });
  expect(response.status).toBe(200);
  expect(generateContent).toHaveBeenCalledTimes(1);
});
test("media exceeding 50 MB is rejected before AI upload", async () => {
  const form = new FormData();
  form.append("media", new Blob([new Uint8Array(50 * 1024 * 1024 + 1)], { type: "video/mp4" }), "too-large.mp4");
  const response = await realFetch(`${baseUrl}/api/youtube/media-upload`, { method: "POST", body: form });
  expect(response.status).toBe(400);
  expect(await response.json()).toMatchObject({ message: "Media file exceeds the 50MB limit." });
  expect(upload).not.toHaveBeenCalled();
});
test("single-document lookup uses the route ID rather than an undefined filter", async () => {
  const response = await realFetch(`${baseUrl}/api/documents/document`);
  expect(response.status).toBe(200);
  expect(prisma.document.findFirst.mock.calls.at(-1)![0]).toMatchObject({ where: { id: "document", userId: "user" } });
});
test("invalid questions are rejected before guardrails", async () => {
  const response = await realFetch(`${baseUrl}/api/query`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: " " }) });
  expect(response.status).toBe(400);
  expect(guardContent).not.toHaveBeenCalled();
});
test("liveness remains available while dependency readiness reports failure", async () => {
  queueRedis.status = "reconnecting";
  const live = await realFetch(`${baseUrl}/live`);
  expect(live.status).toBe(200);
  const health = await realFetch(`${baseUrl}/health`);
  expect(health.status).toBe(503);
  expect(await health.json()).toMatchObject({ queue: "disconnected", worker: "unavailable" });
});
