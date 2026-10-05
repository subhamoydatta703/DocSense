import { aiEmbedding } from "../../config/ai/ai";
import { setTimeout as sleep } from "node:timers/promises";
let embeddingTurn: Promise<void> = Promise.resolve();
let nextEmbeddingAt = 0;
const configuredInterval = Number(process.env.EMBEDDING_MIN_INTERVAL_MS ?? 1000);
const minInterval = Number.isFinite(configuredInterval) && configuredInterval >= 0 ? configuredInterval : 1000;


/**
 * Generates 768-dimensional vector embeddings for a text chunk using Gemini embedding model.
 */
export const createEmbeddings = async (chunk: string, signal?: AbortSignal): Promise<number[]> => {
    const requestSignal = AbortSignal.any([AbortSignal.timeout(20_000), ...(signal ? [signal] : [])]);
    const previous = embeddingTurn;
    let release!: () => void;
    embeddingTurn = new Promise<void>(resolve => { release = resolve; });
    try{
    await previous;
    requestSignal.throwIfAborted();
    await sleep(Math.max(0, nextEmbeddingAt - Date.now()), undefined, { signal: requestSignal });
    nextEmbeddingAt = Date.now() + minInterval;
       

    const response = await aiEmbedding.models.embedContent({
        model: 'gemini-embedding-2',
        contents: chunk,
        config: { outputDimensionality: 768, abortSignal: requestSignal },
    });

    const values = response.embeddings?.[0]?.values;
if (!values || values.length !== 768 || values.some(value => !Number.isFinite(value))) {
  throw new Error("Embedding API returned an invalid 768-dimensional vector");
}
console.info("Embedding created", { dimensions: values.length });
return values;


    }catch(error){
        console.error("Error creating embeddings: ", error);
        throw error;
    } finally {
        release();
    }
}
