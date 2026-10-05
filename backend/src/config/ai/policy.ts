/** Provider policy is centralized; classifiers do not create timers or measure time. */
function positiveInteger(name: string, fallback: number, max: number): number {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value <= 0 || value > max) throw new Error(`${name} must be an integer between 1 and ${max}.`);
  return value;
}
export const aiModels = {
  answer: process.env.GEMINI_ANSWER_MODEL?.trim() || "gemini-3.5-flash-lite",
  guard: process.env.GEMINI_GUARD_MODEL?.trim() || "gemini-3.1-flash-lite",
  optimization: process.env.GEMINI_QUERY_MODEL?.trim() || "gemini-3.6-flash",
  // Changing the embedding model requires a coordinated reindex.
  embedding: "gemini-embedding-2",
};
export const queryPolicy = {
  requestMs: positiveInteger("QUERY_REQUEST_TIMEOUT_MS", 90_000, 300_000),
  guardMs: positiveInteger("QUERY_GUARD_TIMEOUT_MS", 15_000, 60_000),
  answerMs: positiveInteger("QUERY_ANSWER_TIMEOUT_MS", 35_000, 120_000),
  embeddingMs: 20_000,
  rewriteMs: 3_000,
  rewriteEnabled: process.env.QUERY_REWRITE_ENABLED === "true",
};
export function providerSignal(timeoutMs: number, caller?: AbortSignal): AbortSignal {
  caller?.throwIfAborted();
  return AbortSignal.any([AbortSignal.timeout(timeoutMs), ...(caller ? [caller] : [])]);
}
