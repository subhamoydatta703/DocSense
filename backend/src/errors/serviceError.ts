export class ServiceError extends Error {
  constructor(public readonly status: number, message: string, public readonly stage?: string) { super(message); }
}

export async function runQueryStage<T>(stage: string, operation: () => Promise<T>): Promise<T> {
  const startedAt = Date.now();
  try {
    const result = await operation();
    console.info("Query stage completed", { stage, durationMs: Date.now() - startedAt });
    return result;
  } catch (error) {
    if (error instanceof ServiceError) throw error;
    const status = typeof error === "object" && error !== null && "status" in error ? Number(error.status) : 0;
    const aborted = error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError");
    console.error("Query stage failed", { stage, durationMs: Date.now() - startedAt, status: status || undefined, errorType: error instanceof Error ? error.name : "UnknownError" });
    if (status === 429) throw new ServiceError(429, "The AI service is at its request limit. Please try again shortly.", stage);
    if (aborted) throw new ServiceError(504, "The AI service took too long to respond. Please try again.", stage);
    throw new ServiceError(502, "The AI service could not complete this request. Please try again shortly.", stage);
  }
}
