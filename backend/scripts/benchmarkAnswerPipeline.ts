// Provider/queue benchmark with synthetic evidence; no database or S3 writes.
// bun run scripts/benchmarkAnswerPipeline.ts --iterations=5
import "../src/config/env";
import { inputGuardrail } from "../src/guardrails/input/inputGuard";
import { outputGuardrail } from "../src/guardrails/output/outputGuard";
import { createEmbeddings } from "../src/services/processing/embeddingService";
import { generateGroundedAnswer } from "../src/services/query/answerGenerationService";
import { optimizeQuery } from "../src/services/query/queryOptimizationService";
import { queryPolicy } from "../src/config/ai/policy";
import type { RetrievedChunk } from "../src/services/vectors/vectorService";

const iterations = Number(process.argv.find(value => value.startsWith("--iterations="))?.split("=")[1] ?? 5);
if (!Number.isInteger(iterations) || iterations < 1 || iterations > 30) throw new Error("Use between 1 and 30 iterations.");
const question = "Within how many days can I return an item?";
const source: RetrievedChunk = { id: "synthetic-chunk", documentId: "synthetic-document", chunkIndex: 0,
  documentName: "Synthetic policy", sourceKey: "synthetic-v1", distance: 0,
  content: "Items can be returned within 42 days of purchase. A receipt is required." };
let failures = 0;
for (const ingestion of [false, true]) {
  const samples: number[] = [];
  for (let iteration = 0; iteration < iterations; iteration++) {
    const began = performance.now();
    const signal = AbortSignal.timeout(queryPolicy.requestMs);
    const stages: Record<string, number> = {};
    const background: Promise<unknown>[] = [];
    async function stage<T>(name: string, operation: () => Promise<T>): Promise<T> {
      const start = performance.now();
      try { return await operation(); }
      finally { stages[name] = Math.round(performance.now() - start); }
    }
    try {
      if (!(await stage("input_guard", () => inputGuardrail(question, signal))).safe) throw new Error("Synthetic question blocked.");
      let retrievalQuestion = question;
      if (queryPolicy.rewriteEnabled) {
        try { retrievalQuestion = await stage("rewrite", () => optimizeQuery(question, signal)); }
        catch { signal.throwIfAborted(); }
      }
      if (ingestion) {
        for (let i = 0; i < 2; i++) background.push(createEmbeddings(source.content, signal, "background")
          .then(() => undefined, () => { failures++; console.warn("Synthetic ingestion embedding failed"); }));
      }
      await stage("embedding", () => createEmbeddings(retrievalQuestion, signal, "interactive"));
      const answer = await stage("answer_generation", () => generateGroundedAnswer(question, [source], signal));
      if (answer.abstained || !answer.citations.length || !/\b42\b/.test(answer.answer)) throw new Error("Missing synthetic evidence.");
      if (!(await stage("output_guard", () => outputGuardrail(JSON.stringify(answer), signal))).safe) throw new Error("Synthetic answer blocked.");
      const elapsed = Math.round(performance.now() - began);
      samples.push(elapsed);
      console.info("Synthetic query sample", { ingestion, iteration: iteration + 1, elapsedMs: elapsed, stages });
    } catch (error) {
      failures++;
      console.error("Synthetic query sample failed", { ingestion, stages, errorType: error instanceof Error ? error.name : "UnknownError" });
    } finally { await Promise.all(background); }
  }
  samples.sort((a, b) => a - b);
  const percentile = (fraction: number) => samples[Math.max(0, Math.ceil(samples.length * fraction) - 1)];
  const median = samples.length
    ? (samples[Math.floor((samples.length - 1) / 2)]! + samples[Math.floor(samples.length / 2)]!) / 2
    : undefined;
  console.info("Synthetic provider/queue benchmark", { ingestion, attempts: iterations, successes: samples.length,
    medianMs: median, p95Ms: percentile(0.95), rewriteEnabled: queryPolicy.rewriteEnabled });
}
console.info("Synthetic samples exclude database retrieval and are not production latency estimates.");
process.exitCode = failures ? 1 : 0;
