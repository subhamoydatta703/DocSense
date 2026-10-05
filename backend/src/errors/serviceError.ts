export class ServiceError extends Error {
  constructor(public readonly status: number, message: string, public readonly stage?: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ServiceError";
  }
}

export async function runQueryStage<T>(stage: string, operation: () => Promise<T>, signal?: AbortSignal): Promise<T> {
  const startedAt = Date.now();
  try {
    signal?.throwIfAborted();
    const result = await operation();
    signal?.throwIfAborted();
    console.info("Query stage completed", { stage, durationMs: Date.now() - startedAt });
    return result;
  } catch (error) {
    if (error instanceof ServiceError) throw error;
    const status = typeof error === "object" && error !== null && "status" in error ? Number(error.status) : 0;
    const aborted = error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError");
    console.error("Query stage failed", { stage, durationMs: Date.now() - startedAt, status: status || undefined, errorType: error instanceof Error ? error.name : "UnknownError" });
    if (status === 429) throw new ServiceError(429, "The AI service is at its request limit. Please try again shortly.", stage, { cause: error });
    if (status === 503) throw new ServiceError(503, "The AI service is temporarily unavailable. Please try again shortly.", stage, { cause: error });
    if (aborted || signal?.aborted) throw new ServiceError(504, "The request was cancelled or took too long to respond. Please try again.", stage, { cause: error });
    throw new ServiceError(502, "A required service could not complete this request. Please try again shortly.", stage, { cause: error });
  }
}
