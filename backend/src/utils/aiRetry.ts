import { setTimeout as sleep } from "node:timers/promises";

/** Retry a transient provider failure once within the caller's shared deadline. */
export async function retryAiRequest<T>(operation: () => Promise<T>, signal: AbortSignal): Promise<T> {
    signal.throwIfAborted();
    try {
        return await operation();
    } catch (error) {
        signal.throwIfAborted();
        const status = typeof error === "object" && error !== null && "status" in error ? Number(error.status) : 0;
        // Rate limits require a later user retry; invalid/auth requests cannot recover here.
        if (![500, 502, 503, 504].includes(status)) throw error;
        console.warn("Retrying transient AI failure", { status });
        await sleep(500 + Math.floor(Math.random() * 500), undefined, { signal });
        signal.throwIfAborted();
        return operation();
    }
}
