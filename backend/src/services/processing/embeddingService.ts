import { aiEmbedding } from "../../config/ai/ai";
import { setTimeout as sleep } from "node:timers/promises";
import { AiScheduler } from "../../utils/aiScheduler";
import { aiModels, providerSignal, queryPolicy } from "../../config/ai/policy";
import { retryAiRequest } from "../../utils/aiRetry";

const scheduler = new AiScheduler();
let nextEmbeddingAt = 0;
const configuredInterval = Number(process.env.EMBEDDING_MIN_INTERVAL_MS ?? 1000);
const minInterval = Number.isFinite(configuredInterval) && configuredInterval >= 0 ? configuredInterval : 1000;

/** Keep the stored index contract: raw text, Gemini Embedding 2, 768 dimensions. */
export const createEmbeddings = async (
  chunk: string,
  signal?: AbortSignal,
  priority: "interactive" | "background" = "background",
): Promise<number[]> => {
  const requestSignal = providerSignal(queryPolicy.embeddingMs, signal);
  const queuedAt = performance.now();
  return scheduler.schedule(async () => {
    requestSignal.throwIfAborted();
    await sleep(Math.max(0, nextEmbeddingAt - Date.now()), undefined, { signal: requestSignal });
    nextEmbeddingAt = Date.now() + minInterval;
    console.info("Embedding queue wait", { priority, durationMs: Math.round(performance.now() - queuedAt) });

    const response = await retryAiRequest(() => aiEmbedding.models.embedContent({
      model: aiModels.embedding,
      contents: chunk,
      config: {
        outputDimensionality: 768,
        abortSignal: requestSignal,
        httpOptions: { timeout: queryPolicy.embeddingMs },
      },
    }), requestSignal);

    requestSignal.throwIfAborted();
    const values = response.embeddings?.[0]?.values;
    if (!values || values.length !== 768 || values.some(value => !Number.isFinite(value))) {
      throw new Error("Embedding API returned an invalid 768-dimensional vector");
    }
    console.info("Embedding created", { dimensions: values.length });
    return values;
  }, requestSignal, priority);
};
