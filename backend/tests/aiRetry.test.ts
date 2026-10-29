import { expect, mock, test } from "bun:test";
import { GoogleGenAI } from "@google/genai";
import { retryAiRequest } from "../src/utils/aiRetry";

test("SDK without built-in retries preserves a provider 503 status", async () => {
    const originalFetch = globalThis.fetch;
    const fetchMock = mock(async () => new Response(JSON.stringify({
        error: { code: 503, message: "Provider overloaded", status: "UNAVAILABLE" },
    }), { status: 503, headers: { "Content-Type": "application/json" } }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    try {
        const client = new GoogleGenAI({ apiKey: "test-only", httpOptions: { timeout: 35_000 } });
        await expect(client.models.generateContent({ model: "gemini-3.6-flash", contents: "test" }))
            .rejects.toMatchObject({ status: 503 });
        expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test("transient server errors recover on the second attempt", async () => {
    const operation = mock(async () => "answer");
    operation.mockRejectedValueOnce(Object.assign(new Error("unavailable"), { status: 503 }));
    expect(await retryAiRequest(operation, AbortSignal.timeout(5_000))).toBe("answer");
    expect(operation).toHaveBeenCalledTimes(2);
});

test("rate limit and authentication failures are not retried", async () => {
    for (const status of [429, 401, 403, 404]) {
        const error = Object.assign(new Error("provider failure"), { status });
        const operation = mock(async () => { throw error; });
        await expect(retryAiRequest(operation, AbortSignal.timeout(5_000))).rejects.toBe(error);
        expect(operation).toHaveBeenCalledTimes(1);
    }
});

test("cancellation during backoff stops the second attempt", async () => {
    const operation = mock(async () => { throw Object.assign(new Error("unavailable"), { status: 503 }); });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new DOMException("Caller cancelled", "AbortError")), 30);
    const error = await retryAiRequest(operation, controller.signal).then(() => null, error => error);
    clearTimeout(timer);
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("AbortError");
    expect(operation).toHaveBeenCalledTimes(1);
});

test("already cancelled requests never reach the provider", async () => {
    const operation = mock(async () => "answer");
    await expect(retryAiRequest(operation, AbortSignal.abort())).rejects.toThrow();
    expect(operation).not.toHaveBeenCalled();
});

test("a stalled attempt is cancelled and retried inside the shared deadline", async () => {
    const attemptSignals: AbortSignal[] = [];
    const operation = mock(async (signal: AbortSignal) => {
        attemptSignals.push(signal);
        if (attemptSignals.length === 1) return new Promise<string>(() => {});
        return "recovered";
    });
    expect(await retryAiRequest(operation, AbortSignal.timeout(3_000), { attemptMs: 20, retryTimeouts: true })).toBe("recovered");
    expect(attemptSignals[0]!.aborted).toBeTrue();
    expect(attemptSignals[1]!.aborted).toBeFalse();
});

test("caller cancellation cannot trigger a timeout retry", async () => {
    const operation = mock(async (_signal: AbortSignal) => new Promise<string>(() => {}));
    await expect(retryAiRequest(operation, AbortSignal.timeout(20), { attemptMs: 100, retryTimeouts: true })).rejects.toThrow();
    expect(operation).toHaveBeenCalledTimes(1);
});
