// Manual live smoke check: bun run scripts/checkAnswerPipeline.ts
// Uses configured Gemini credentials with synthetic context; no DB or document writes.
import "../src/config/env";
import { inputGuardrail } from "../src/guardrails/input/inputGuard";
import { outputGuardrail } from "../src/guardrails/output/outputGuard";
import { optimizeQuery } from "../src/services/query/queryOptimizationService";
import { createEmbeddings } from "../src/services/processing/embeddingService";
import { generateGroundedAnswer } from "../src/services/query/answerGenerationService";

if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is required for the live smoke check.");

const question = "Within how many days can an item be returned?";
const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), 90_000);
let failed = false;
async function check<T>(stage: string, operation: () => Promise<T>, required = true): Promise<T | undefined> {
    const start = Date.now();
    try {
        const result = await operation();
        console.info("Live check passed", { stage, durationMs: Date.now() - start });
        return result;
    } catch (error) {
        if (required) failed = true;
        console.error("Live check failed", {
            stage, durationMs: Date.now() - start,
            status: typeof error === "object" && error !== null && "status" in error ? error.status : undefined,
            errorType: error instanceof Error ? error.name : "UnknownError",
        });
        return undefined;
    }
}

try {
    // Check each provider independently even if an earlier provider call fails.
    await check("input_guard", async () => {
        const result = await inputGuardrail(question, controller.signal);
        if (!result.safe) throw new Error("Synthetic question was blocked.");
        return result;
    });
    const rewritten = await check("query_optimization", () => optimizeQuery(question, controller.signal), false);
    await check("embedding", () => createEmbeddings(rewritten || question, controller.signal));
    const answer = await check("answer_generation", async () => {
        const result = await generateGroundedAnswer(question, [{
            id: "synthetic-chunk", documentName: "Smoke test policy", distance: 0.1,
            documentId: "synthetic-document", chunkIndex: 0, sourceKey: "synthetic-v1",
            content: "Items can be returned within 42 days of purchase. A receipt is required.",
        }], controller.signal);
        if (result.abstained || !/\b42\b/.test(result.answer) || !/\[Source 1\]/i.test(result.answer)
            || !result.citations.some(citation => citation.quote.includes("42 days"))) {
            throw new Error("Answer did not include the source fact and citation.");
        }
        console.info("Live evidence check passed", { citations: result.citations.length });
        return result;
    });
    if (answer) await check("output_guard", async () => {
        const result = await outputGuardrail(JSON.stringify(answer), controller.signal);
        if (!result.safe) throw new Error("Synthetic answer was blocked.");
        return result;
    });
} finally {
    clearTimeout(timer);
    controller.abort();
}
process.exitCode = failed ? 1 : 0;
