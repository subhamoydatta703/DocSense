import { afterAll, afterEach, beforeAll, beforeEach, expect, mock, test } from "bun:test";
import { UnrecoverableError } from "bullmq";

// No test connects to the application's configured database, Redis, S3, or AI accounts.
process.env.EMBEDDING_MIN_INTERVAL_MS = "0";
process.env.QUERY_REWRITE_ENABLED = "true";
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

const chunkMetadata = { documentId: "document", chunkIndex: 0, sourceKey: "new-upload" };
const generatedClaim = (chunkId: string, quote: string, text = quote) => JSON.stringify({
  abstained: false, claims: [{ text, evidence: [{ chunkId, quote }] }],
});
const defaultGeneration = async (args: unknown) => {
  const request = args as { contents: string; config?: { responseJsonSchema?: unknown } };
  if (!request.config?.responseJsonSchema) return { text: "A valid answer." };
  const source = JSON.parse(request.contents).sources[0] as { chunkId: string; text: string };
  return { text: generatedClaim(source.chunkId, source.text) };
};
const generateContent = mock(defaultGeneration);
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
const getCache = mock(async (_key: string): Promise<string | null> => null);
const setCache = mock(async (_key: string, _ttl: number, _content: string) => "OK");
mock.module("../src/config/redis/redisCaching", () => ({ redisClient: { isReady: true, ping: async () => "PONG", eval: evalLimit, get: getCache, setEx: setCache } }));

const { createVector, searchSimilarVectors } = await import("../src/services/vectors/vectorService");
const { processDocumentService } = await import("../src/services/processing/processDocumentService");
const { saveDocumentSource } = await import("../src/services/document/saveDocumentSource");
const { enqueueDocument, recoverUnqueuedDocuments, documentJobId } = await import("../src/queue/documentQueue");
const { startWorker, stopWorker } = await import("../src/services/worker/workerService");
const { getSupadataTranscript } = await import("../src/services/youtube/supadataTranscriptService");
const { transcribeUploadedMedia } = await import("../src/services/youtube/mediaTranscriptionService");
const { transcriptYoutubeVideo } = await import("../src/services/youtube/transcriptService");
const { inputGuardrail } = await import("../src/guardrails/input/inputGuard");
const { outputGuardrail } = await import("../src/guardrails/output/outputGuard");
const { parseGuardrailResponse, inputCategories } = await import("../src/guardrails/guardrailSchema");
const { createEmbeddings } = await import("../src/services/processing/embeddingService");
const { userQueryService } = await import("../src/services/query/queryService");
const { rateLimiter } = await import("../src/middlewares/rateLimiterMiddleware");

beforeEach(() => {
  source = { id: "document", s3Key: "new-upload", sourceType: "PDF", status: "COMPLETED", userId: "user" };
  chunks = ["first chunk", "second chunk"];
  for (const fn of [rawQuery, rawExecute, updateMany, transaction, deleteFile, generateContent, guardContent, optimizeContent, embedContent, upload, getFile, deleteMedia, queueAdd, getJob, tx.$queryRaw, tx.documentChunk.deleteMany, tx.document.update, prisma.document.findMany]) fn.mockReset();
  transaction.mockImplementation(async operation => operation(tx));
  rawExecute.mockImplementation(async () => 1);
  deleteFile.mockImplementation(async () => undefined);
  deleteMedia.mockImplementation(async () => undefined);
  tx.$queryRaw.mockImplementation(async () => source ? [{ id: source.id, s3Key: source.s3Key }] : []);
  tx.documentChunk.deleteMany.mockImplementation(async () => ({ count: 1 }));
  tx.document.update.mockImplementation(async ({ data }) => ({ ...source, ...data }));
  prisma.document.findFirst.mockReset().mockImplementation(async () => source);
  prisma.document.findUnique.mockReset().mockImplementation(async () => source);
  prisma.document.findMany.mockImplementation(async () => source ? [source] : []);
  rawQuery.mockImplementation(async () => []);
  updateMany.mockImplementation(async () => ({ count: 1 }));
  generateContent.mockImplementation(defaultGeneration);
  guardContent.mockImplementation(async () => ({ text: '{"safe":true,"category":"SAFE","reason":"Allowed"}' }));
  optimizeContent.mockImplementation(async () => ({ text: "optimized question" }));
  embedContent.mockImplementation(async () => ({ embeddings: [{ values: Array(768).fill(0.1) }] }));
  upload.mockImplementation(async () => ({ name: "files/test", uri: "gs://test", mimeType: "video/mp4", state: "ACTIVE" }));
  getFile.mockImplementation(async () => ({ name: "files/test", uri: "gs://test", mimeType: "video/mp4", state: "ACTIVE" }));
  queueAdd.mockImplementation(async () => ({ id: "queued-job" }));
  getJob.mockImplementation(async () => null);
  evalLimit.mockImplementation(async () => [1, 60]);
  getCache.mockReset().mockImplementation(async () => null);
  setCache.mockReset().mockImplementation(async () => "OK");
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
test("input classification accepts a fenced JSON response", async () => {
  guardContent.mockResolvedValueOnce({ text: '```json\n{"safe":true,"category":"SAFE","reason":"Allowed"}\n```' });
  expect(await inputGuardrail("What does the document say?")).toMatchObject({ safe: true, category: "SAFE" });
});
test("already cancelled questions stop before readiness and never reach Gemini", async () => {
  await expect(userQueryService("question", "user", "document", AbortSignal.abort())).rejects.toMatchObject({ status: 504, stage: "document_readiness" });
  expect(guardContent).not.toHaveBeenCalled();
  expect(prisma.document.findFirst).not.toHaveBeenCalled();
});
test("input classifier errors retain their pipeline stage", async () => {
  guardContent.mockRejectedValueOnce(new DOMException("The operation was aborted.", "AbortError"));
  await expect(userQueryService("question", "user", "document")).rejects.toMatchObject({ status: 504, stage: "input_guard" });
  expect(guardContent).toHaveBeenCalledTimes(1);
});
test("input classifier outages retain their provider status", async () => {
  guardContent.mockImplementation(async () => { throw Object.assign(new Error("Overloaded"), { status: 503 }); });
  await expect(userQueryService("question", "user", "document")).rejects.toMatchObject({ status: 503, stage: "input_guard" });
  expect(guardContent).toHaveBeenCalledTimes(2);
});
test("caller cancellation in the input classifier blocks the rest of the pipeline", async () => {
  const controller = new AbortController();
  guardContent.mockImplementationOnce(async () => {
    controller.abort();
    return { text: '{"safe":true,"category":"SAFE","reason":"Allowed"}' };
  });
  await expect(userQueryService("question", "user", "document", controller.signal)).rejects.toMatchObject({ status: 504, stage: "input_guard" });
  expect(guardContent).toHaveBeenCalledTimes(1);
  expect(optimizeContent).not.toHaveBeenCalled();
  expect(embedContent).not.toHaveBeenCalled();
  expect(generateContent).not.toHaveBeenCalled();
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
  rawQuery.mockResolvedValueOnce([{ ...chunkMetadata, id: "chunk", content: "context", documentName: "file", distance: 0.1 }]);
  expect(await userQueryService("original question", "user", "document")).toBe("context [Source 1]");
  expect(embedContent.mock.calls[0]![0]).toMatchObject({ contents: "original question" });
});
test("answer pipeline uses relevant context and validates the generated answer", async () => {
  rawQuery.mockResolvedValueOnce([
    { ...chunkMetadata, id: "relevant", content: "Returns are accepted within 42 days.", documentName: "Policy", distance: 0.1 },
    { ...chunkMetadata, id: "irrelevant", content: "Unrelated source text", documentName: "Other", distance: 0.8 },
  ]);
  generateContent.mockResolvedValueOnce({ text: generatedClaim("relevant", "Returns are accepted within 42 days.", "Returns are accepted within 42 days.") });
  expect(await userQueryService("How long do I have to return an item?", "user", "document"))
    .toBe("Returns are accepted within 42 days. [Source 1]");
  const request = generateContent.mock.calls[0]![0] as { contents: string };
  expect(request.contents).toContain("Returns are accepted within 42 days.");
  expect(request.contents).toContain("How long do I have to return an item?");
  expect(request.contents).not.toContain("Unrelated source text");
  expect(guardContent).toHaveBeenCalledTimes(2);
  expect((guardContent.mock.calls[1]![0] as { contents: string }).contents)
    .toContain("Returns are accepted within 42 days. [Source 1]");
});
test("retrieval with no relevant chunks skips generation and output validation", async () => {
  rawQuery.mockResolvedValueOnce([{ ...chunkMetadata, id: "chunk", content: "unrelated", documentName: "file", distance: 0.9 }]);
  expect(await userQueryService("question", "user", "document")).toBe("I don't have enough information to answer this question.");
  expect(generateContent).not.toHaveBeenCalled();
  expect(guardContent).toHaveBeenCalledTimes(1);
});
test("unsafe input stops before retrieval and generation", async () => {
  guardContent.mockResolvedValueOnce({ text: '{"safe":false,"category":"PROMPT_INJECTION","reason":"Blocked input"}' });
  await expect(userQueryService("question", "user", "document")).rejects.toMatchObject({ name: "GuardrailError", category: "PROMPT_INJECTION" });
  expect(optimizeContent).not.toHaveBeenCalled();
  expect(embedContent).not.toHaveBeenCalled();
  expect(generateContent).not.toHaveBeenCalled();
});
test("temporary answer outage recovers and still runs output validation", async () => {
  rawQuery.mockResolvedValueOnce([{ ...chunkMetadata, id: "chunk", content: "context", documentName: "file", distance: 0.1 }]);
  generateContent.mockRejectedValueOnce(Object.assign(new Error("Provider overloaded"), { status: 503 }));
  expect(await userQueryService("question", "user", "document")).toBe("context [Source 1]");
  expect(generateContent).toHaveBeenCalledTimes(2);
  expect(guardContent).toHaveBeenCalledTimes(2);
});
test("embedding overloads retry once and preserve status when both attempts fail", async () => {
  const overloaded = Object.assign(new Error("Overloaded"), { status: 503 });
  embedContent.mockRejectedValueOnce(overloaded);
  expect(await createEmbeddings("readable text")).toHaveLength(768);
  expect(embedContent).toHaveBeenCalledTimes(2);
  embedContent.mockImplementation(async () => { throw overloaded; });
  const error = await userQueryService("question", "user", "document").then(() => null, error => error);
  expect(error).toMatchObject({ status: 503, stage: "embedding" });
  expect(generateContent).not.toHaveBeenCalled();
});
test("a summary of a specific section uses focused retrieval", async () => {
  rawQuery.mockResolvedValueOnce([{ ...chunkMetadata, id: "chunk", content: "Clause 7 covers termination.", documentName: "Policy", distance: 0.1 }]);
  expect(await userQueryService("Summarize clause 7", "user", "document")).toContain("Clause 7");
  expect(embedContent).toHaveBeenCalledTimes(1);
  expect(String(rawQuery.mock.calls[0]![0])).toContain("ORDER BY distance");
});
test("valid transcript cache entries avoid external requests", async () => {
  const cached = { transcriptContent: "A readable synthetic video transcript.", title: "Video", channel: "Channel", videoId: "abcdefghijk", sourceUrl: "https://www.youtube.com/watch?v=abcdefghijk" };
  getCache.mockResolvedValueOnce(JSON.stringify(cached));
  const fetched = mock(async () => { throw new Error("External request should not run"); });
  globalThis.fetch = fetched as unknown as typeof fetch;
  expect(await transcriptYoutubeVideo(cached.sourceUrl)).toEqual(cached);
  expect(fetched).not.toHaveBeenCalled();
});
test("invalid transcript cache entries fall through to fresh validated metadata and text", async () => {
  getCache.mockResolvedValueOnce(JSON.stringify({ videoId: "other-video", transcriptContent: "wrong" }));
  const fetched = mock(async (url: unknown) => String(url).includes("oembed")
    ? Response.json({ title: "Fresh video", author_name: "Fresh channel" })
    : Response.json({ content: "A fresh readable transcript with actual source text." }));
  globalThis.fetch = fetched as unknown as typeof fetch;
  const result = await transcriptYoutubeVideo("https://www.youtube.com/watch?v=abcdefghijk");
  expect(result.title).toBe("Fresh video");
  expect(result.transcriptContent).toContain("fresh readable transcript");
  expect(fetched).toHaveBeenCalledTimes(2);
  expect(setCache).toHaveBeenCalledTimes(1);
});
test("empty answers fail without retrying or running output validation", async () => {
  rawQuery.mockResolvedValueOnce([{ ...chunkMetadata, id: "chunk", content: "context", documentName: "file", distance: 0.1 }]);
  generateContent.mockResolvedValueOnce({ text: "   " });
  await expect(userQueryService("question", "user", "document")).rejects.toMatchObject({ status: 502, stage: "answer_generation" });
  expect(generateContent).toHaveBeenCalledTimes(1);
  expect(guardContent).toHaveBeenCalledTimes(1);
});
test("answer rate limits remain 429 and do not trigger an immediate retry", async () => {
  rawQuery.mockResolvedValueOnce([{ ...chunkMetadata, id: "chunk", content: "context", documentName: "file", distance: 0.1 }]);
  generateContent.mockRejectedValueOnce(Object.assign(new Error("Rate limited"), { status: 429 }));
  await expect(userQueryService("question", "user", "document")).rejects.toMatchObject({ status: 429, stage: "answer_generation" });
  expect(generateContent).toHaveBeenCalledTimes(1);
  expect(guardContent).toHaveBeenCalledTimes(1);
});
test("cancelled answer generation stops without retrying or returning an answer", async () => {
  const controller = new AbortController();
  rawQuery.mockResolvedValueOnce([{ ...chunkMetadata, id: "chunk", content: "context", documentName: "file", distance: 0.1 }]);
  generateContent.mockImplementationOnce(async args => {
    const requestSignal = (args as { config: { abortSignal: AbortSignal } }).config.abortSignal;
    controller.abort(new DOMException("Test deadline reached", "TimeoutError"));
    requestSignal.throwIfAborted();
    return { text: "Should never return" };
  });
  await expect(userQueryService("question", "user", "document", controller.signal))
    .rejects.toMatchObject({ status: 504, stage: "answer_generation" });
  expect(generateContent).toHaveBeenCalledTimes(1);
  expect(guardContent).toHaveBeenCalledTimes(1);
});
test("unsafe generated output is never returned", async () => {
  rawQuery.mockResolvedValueOnce([{ ...chunkMetadata, id: "chunk", content: "context", documentName: "file", distance: 0.1 }]);
  guardContent.mockResolvedValueOnce({ text: '{"safe":true,"category":"SAFE","reason":"Allowed"}' });
  guardContent.mockResolvedValueOnce({ text: '{"safe":false,"category":"SENSITIVE_INFORMATION","reason":"Blocked output"}' });
  await expect(userQueryService("question", "user", "document")).rejects.toMatchObject({ name: "GuardrailError", category: "SENSITIVE_INFORMATION" });
});
test("output classifier failures fail closed", async () => {
  rawQuery.mockResolvedValueOnce([{ ...chunkMetadata, id: "chunk", content: "context", documentName: "file", distance: 0.1 }]);
  guardContent.mockResolvedValueOnce({ text: '{"safe":true,"category":"SAFE","reason":"Allowed"}' });
  guardContent.mockResolvedValueOnce({ text: "invalid JSON" });
  await expect(userQueryService("question", "user", "document")).rejects.toMatchObject({ status: 502, stage: "output_guard" });
});
test("temporary output classifier outages recover and return the generated answer", async () => {
  rawQuery.mockResolvedValueOnce([{ ...chunkMetadata, id: "chunk", content: "context", documentName: "file", distance: 0.1 }]);
  guardContent.mockResolvedValueOnce({ text: '{"safe":true,"category":"SAFE","reason":"Allowed"}' });
  guardContent.mockRejectedValueOnce(Object.assign(new Error("Overloaded"), { status: 503 }));
  expect(await userQueryService("question", "user", "document")).toBe("context [Source 1]");
  expect(guardContent).toHaveBeenCalledTimes(3);
  expect(generateContent).toHaveBeenCalledTimes(1);
});
test("recovery from an output classifier outage still blocks unsafe answers", async () => {
  rawQuery.mockResolvedValueOnce([{ ...chunkMetadata, id: "chunk", content: "context", documentName: "file", distance: 0.1 }]);
  guardContent.mockResolvedValueOnce({ text: '{"safe":true,"category":"SAFE","reason":"Allowed"}' });
  guardContent.mockRejectedValueOnce(Object.assign(new Error("Overloaded"), { status: 503 }));
  guardContent.mockResolvedValueOnce({ text: '{"safe":false,"category":"SENSITIVE_INFORMATION","reason":"Blocked output"}' });
  await expect(userQueryService("question", "user", "document")).rejects.toMatchObject({ name: "GuardrailError", category: "SENSITIVE_INFORMATION" });
  expect(guardContent).toHaveBeenCalledTimes(3);
});
test("already cancelled output classification never calls Gemini", async () => {
  await expect(outputGuardrail("answer", AbortSignal.abort())).rejects.toMatchObject({ name: "AbortError" });
  expect(guardContent).not.toHaveBeenCalled();
});
test("cancellation during output retry backoff stops further calls", async () => {
  const controller = new AbortController();
  guardContent.mockImplementationOnce(async () => {
    queueMicrotask(() => controller.abort());
    throw Object.assign(new Error("Overloaded"), { status: 503 });
  });
  await expect(outputGuardrail("answer", controller.signal)).rejects.toMatchObject({ name: "AbortError" });
  expect(guardContent).toHaveBeenCalledTimes(1);
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
  const response = await realFetch(`${baseUrl}/api/text`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Large source", text: '"a'.repeat(250_000) }) });
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
test("persistent answer provider outages return 503 with retry guidance", async () => {
  rawQuery.mockResolvedValueOnce([{ ...chunkMetadata, id: "chunk", content: "context", documentName: "file", distance: 0.1 }]);
  generateContent.mockImplementation(async () => { throw Object.assign(new Error("Provider overloaded"), { status: 503 }); });
  const response = await realFetch(`${baseUrl}/api/query`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: "question" }) });
  expect(response.status).toBe(503);
  expect(response.headers.get("Retry-After")).toBe("30");
  expect(await response.json()).toMatchObject({ success: false, stage: "answer_generation", message: "The AI service is temporarily unavailable. Please try again shortly." });
  expect(generateContent).toHaveBeenCalledTimes(2);
  expect(guardContent).toHaveBeenCalledTimes(1);
});
test("persistent output classifier outages return 503 without releasing the answer", async () => {
  rawQuery.mockResolvedValueOnce([{ ...chunkMetadata, id: "chunk", content: "context", documentName: "file", distance: 0.1 }]);
  guardContent.mockResolvedValueOnce({ text: '{"safe":true,"category":"SAFE","reason":"Allowed"}' });
  guardContent.mockImplementation(async () => { throw Object.assign(new Error("Overloaded"), { status: 503 }); });
  const response = await realFetch(`${baseUrl}/api/query`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: "question" }) });
  expect(response.status).toBe(503);
  expect(response.headers.get("Retry-After")).toBe("30");
  const body = await response.json() as Record<string, unknown>;
  expect(body).toMatchObject({ success: false, stage: "output_guard" });
  expect(body.answer).toBeUndefined();
  expect(guardContent).toHaveBeenCalledTimes(3);
});
test("liveness remains available while dependency readiness reports failure", async () => {
  queueRedis.status = "reconnecting";
  const live = await realFetch(`${baseUrl}/live`);
  expect(live.status).toBe(200);
  const health = await realFetch(`${baseUrl}/health`);
  expect(health.status).toBe(503);
  expect(await health.json()).toMatchObject({ queue: "disconnected", worker: "unavailable" });
});

test("production guard functions reject string booleans and contradictory results", async () => {
  for (const text of ['{"safe":"false","category":"SAFE","reason":"bad"}', '{"safe":false,"category":"SAFE","reason":"bad"}']) {
    guardContent.mockResolvedValueOnce({ text });
    await expect(inputGuardrail("question")).rejects.toThrow();
    guardContent.mockResolvedValueOnce({ text });
    await expect(outputGuardrail("answer")).rejects.toThrow();
  }
});
test("an input classifier transient outage recovers before continuing", async () => {
  guardContent.mockRejectedValueOnce(Object.assign(new Error("Overloaded"), { status: 503 }));
  expect(await userQueryService("question", "user", "document")).toBe("I don't have enough information to answer this question.");
  expect(guardContent).toHaveBeenCalledTimes(2);
  expect(embedContent).toHaveBeenCalledTimes(1);
});
test("unsupported claims are withheld even when the output is otherwise safe", async () => {
  rawQuery.mockResolvedValueOnce([{ ...chunkMetadata, id: "chunk", content: "context", documentName: "file", distance: 0.1 }]);
  guardContent.mockResolvedValueOnce({ text: '{"safe":true,"category":"SAFE","reason":"Allowed"}' });
  guardContent.mockResolvedValueOnce({ text: '{"safe":false,"category":"UNSUPPORTED_CLAIM","reason":"The quote does not support the claim."}' });
  expect(await userQueryService("question", "user", "document")).toBe("I don't have enough information to answer this question.");
});
test("answer and quote content are withheld when the source changes during generation", async () => {
  rawQuery.mockResolvedValueOnce([{ ...chunkMetadata, id: "chunk", content: "context", documentName: "file", distance: 0.1 }]);
  generateContent.mockImplementationOnce(async args => {
    source!.s3Key = "replacement-upload";
    return defaultGeneration(args);
  });
  await expect(userQueryService("question", "user", "document")).rejects.toMatchObject({ status: 409, stage: "source_validation" });
});
test("blocked and truncated answer completions do not reach output classification", async () => {
  for (const metadata of [{ candidates: [{ finishReason: "MAX_TOKENS" }] }, { promptFeedback: { blockReason: "SAFETY" } }]) {
    rawQuery.mockResolvedValueOnce([{ ...chunkMetadata, id: "chunk", content: "context", documentName: "file", distance: 0.1 }]);
    generateContent.mockResolvedValueOnce({ text: generatedClaim("chunk", "context"), ...metadata });
    const before = guardContent.mock.calls.length;
    await expect(userQueryService("question", "user", "document")).rejects.toMatchObject({ status: 502, stage: "answer_generation" });
    expect(guardContent.mock.calls.length - before).toBe(1);
  }
});
test("short-document summaries receive all ordered sections and skip query rewriting and embedding", async () => {
  rawQuery.mockResolvedValueOnce([
    { ...chunkMetadata, id: "first", content: "The first section is about returns.", documentName: "file", distance: 0 },
    { ...chunkMetadata, id: "last", chunkIndex: 1, content: "The last section requires a receipt.", documentName: "file", distance: 0 },
  ]);
  await userQueryService("Summarize this document", "user", "document");
  expect(optimizeContent).not.toHaveBeenCalled();
  expect(embedContent).not.toHaveBeenCalled();
  const request = generateContent.mock.calls[0]![0] as { contents: string };
  expect(JSON.parse(request.contents).sources).toHaveLength(2);
  expect(String(rawQuery.mock.calls[0]![0])).toContain('ORDER BY dc."chunkIndex"');
});
test("oversized full-document summaries report their limit without presenting partial context as complete", async () => {
  rawQuery.mockResolvedValueOnce(Array.from({ length: 31 }, (_, index) => ({ ...chunkMetadata, id: `chunk-${index}`, content: "context", documentName: "file", distance: 0 })));
  expect(await userQueryService("Summarize this document", "user", "document")).toContain("too long for a complete summary");
  expect(generateContent).not.toHaveBeenCalled();
});
test("legacy marker-only vectors never become generation context", async () => {
  rawQuery.mockResolvedValueOnce([{ ...chunkMetadata, id: "chunk", content: "-- 1 of 1 --", documentName: "resume.pdf", distance: 0.1 }]);
  expect(await userQueryService("question", "user", "document")).toBe("I don't have enough information to answer this question.");
  expect(generateContent).not.toHaveBeenCalled();
});
test("a marker-only processing job fails with an actionable reason without creating embeddings", async () => {
  chunks = ["-- 1 of 1 --"];
  await startWorker();
  await expect(processJob({ data: { documentId: "document", s3Key: "new-upload" }, attemptsMade: 0, opts: { attempts: 3 } })).rejects.toBeInstanceOf(UnrecoverableError);
  expect(updateMany.mock.calls.at(-1)![0]).toMatchObject({ data: { status: "FAILED", failureReason: expect.stringContaining("OCR") } });
  expect(embedContent).not.toHaveBeenCalled();
});
test("successful query HTTP responses include verified quotes and stable source metadata", async () => {
  rawQuery.mockResolvedValueOnce([{ ...chunkMetadata, id: "chunk", content: "context", documentName: "file", distance: 0.1 }]);
  const response = await realFetch(`${baseUrl}/api/query`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: "question" }) });
  expect(response.status).toBe(200);
  const data = await response.json() as { answer: string; citations: unknown[] };
  expect(data.answer).toBe("context [Source 1]");
  expect(data.citations).toHaveLength(1);
  expect(data.citations[0]).toMatchObject({ chunkId: "chunk", quote: "context", documentId: "document" });
  expect(JSON.stringify(data)).not.toContain("new-upload");
});
test("missing or foreign documents stop before any provider calls", async () => {
  prisma.document.findFirst.mockResolvedValueOnce(null);
  await expect(userQueryService("question", "user", "unknown-document")).rejects.toMatchObject({ status: 404 });
  expect(prisma.document.findFirst.mock.calls[0]![0]).toMatchObject({ where: { id: "unknown-document", userId: "user" } });
  expect(guardContent).not.toHaveBeenCalled();
});
test("unreadable text sources and fake PDF uploads are rejected before source storage", async () => {
  const text = await realFetch(`${baseUrl}/api/text`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Blank", text: "-- 1 of 1 --\n".repeat(3) }) });
  expect(text.status).toBe(422);
  const file = new FormData();
  file.append("document", new Blob(["plain text, not PDF"], { type: "application/pdf" }), "fake.pdf");
  const pdf = await realFetch(`${baseUrl}/api/upload`, { method: "POST", body: file });
  expect(pdf.status).toBe(400);
  expect(queueAdd).not.toHaveBeenCalled();
});
