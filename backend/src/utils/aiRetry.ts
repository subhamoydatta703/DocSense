import { setTimeout as sleep } from "node:timers/promises";
import { abortable } from "./deadline";

interface RetryOptions {
    attemptMs?: number;
    retryTimeouts?: boolean;
}

/** Retry a transient provider failure once within the caller's shared deadline. */
export async function retryAiRequest<T>(operation: (attemptSignal: AbortSignal) => Promise<T>, signal: AbortSignal, options: RetryOptions = {}): Promise<T> {
    signal.throwIfAborted();
    const runAttempt = async () => {
        if (!options.attemptMs) return abortable(operation(signal), signal);
        const controller = new AbortController();
        const cancel = () => controller.abort(signal.reason);
        signal.addEventListener("abort", cancel, { once: true });
        const timer = setTimeout(() => controller.abort(new DOMException("AI attempt timed out", "TimeoutError")), options.attemptMs);
        try {
            signal.throwIfAborted();
            return await abortable(operation(controller.signal), controller.signal);
        } finally {
            clearTimeout(timer);
            signal.removeEventListener("abort", cancel);
        }
    };
    try {
        return await runAttempt();
    } catch (error) {
        signal.throwIfAborted();
        const status = typeof error === "object" && error !== null && "status" in error ? Number(error.status) : 0;
        // Rate limits require a later user retry; invalid/auth requests cannot recover here.
        const timeout = options.retryTimeouts && error instanceof Error && error.name === "TimeoutError";
        if (![500, 502, 503, 504].includes(status) && !timeout) throw error;
        console.warn("Retrying transient AI failure", { status: status || undefined, timeout: Boolean(timeout) });
        await sleep(500 + Math.floor(Math.random() * 500), undefined, { signal });
        signal.throwIfAborted();
        return runAttempt();
    }
}
