# Query pipeline repair and local verification

The reported failure happened after answer generation: Google returned `503 UNAVAILABLE` to the output classifier. The original trace spent roughly 24 seconds across input classification, a cancelled rewrite, embedding, generation and output classification. A successful generation alone does not complete the request; output validation must finish before the answer is released.

The repair preserves provider status codes, retries transient 5xx failures once with jitter within the same stage budget, and reports 429/503/504 separately. A guard outage still prevents releasing an unchecked answer. Optional rewriting defaults off because the configured rewrite model repeatedly exceeded its three-second budget. Google capacity and quota failures can still happen; application code cannot guarantee their availability.

## Request contract and grounding

`POST /api/query` accepts `{ "query": "...", "documentId": "<UUID>" }`. The selected document must belong to the signed-in user and be `COMPLETED`. Without a document ID, retrieval searches only that user's completed documents. Questions are independent; previous messages are not model context.

A successful response preserves the `answer` string and adds `citations` and `abstained`:

```json
{
  "success": true,
  "answer": "Items can be returned within 42 days. [Source 1]",
  "abstained": false,
  "citations": [{
    "id": 1,
    "chunkId": "stored-chunk-id",
    "documentId": "stored-document-id",
    "documentName": "Policy.txt",
    "chunkIndex": 0,
    "sourceVersion": "opaque-version-hash",
    "quote": "Items can be returned within 42 days."
  }]
}
```

Generation uses JSON Schema with application validation. Every claim needs a known chunk ID and a verbatim quote; invented references, fabricated quotes and numeric values absent from the evidence cause abstention. The server supplies citation markers. The output classifier checks security and whether the displayed claims follow from their quotes, including negations and qualifications. Quotes and titles are also classified because they appear in the browser. Source ownership, status and version are checked again before publishing.

These checks reduce unsupported answers; they do not prove semantic correctness or guarantee zero hallucinations. Exact quotes can be misinterpreted, a model classifier can err, and relevant passages may be missed by retrieval. Users should inspect the quoted evidence for important decisions.

Focused questions retain the existing nearest-five search and cosine-distance threshold of 0.4. These values need evaluation against representative documents before tuning. Full-document summaries of a selected source use ordered context up to 30 chunks and 30,000 characters. Larger sources receive an explicit request to ask about a section/topic. Questions naming a section, clause, chapter, paragraph, page or topic use focused retrieval.

## Central provider policy

`src/config/ai/policy.ts` owns the policy. `inputGuard.ts` contains no timer, timestamp or locally created timeout. The request controller forwards one cancellation signal through all AI stages; classifier/provider helpers enforce centrally configured stage budgets.

| Setting | Default | Purpose |
| --- | --- | --- |
| `QUERY_REQUEST_TIMEOUT_MS` | 90000 | Entire query request |
| `QUERY_GUARD_TIMEOUT_MS` | 15000 | Each classifier, including its retry |
| `QUERY_ANSWER_TIMEOUT_MS` | 35000 | Generation, including its retry |
| `QUERY_REWRITE_ENABLED` | false | Opt-in rewrite, bounded to 3000 ms |
| `GEMINI_ANSWER_MODEL` | gemini-3.5-flash-lite | Structured answer generation |
| `GEMINI_GUARD_MODEL` | gemini-3.1-flash-lite | Input/output classification |
| `GEMINI_QUERY_MODEL` | gemini-3.6-flash | Optional query rewriting |
| `EMBEDDING_MIN_INTERVAL_MS` | 1000 | Per-process embedding pacing |

Embeddings remain raw text with `gemini-embedding-2` and 768 dimensions. The 20-second embedding budget includes queue wait. Interactive questions take priority over background ingestion, with fairness for background work and prompt queued cancellation. Separate API and worker processes have separate queues/pacing; configure aggregate usage against the Google project's actual quotas. Different API keys in one project do not create separate quota pools.

The repair leaves Gemini generation sampling defaults intact, as recommended by Google's Gemini 3 guidance. Changing model names, task prefixes or embedding normalization needs a versioned reindex and retrieval evaluation; it must not silently mix incompatible index formats.

## Ingestion and existing bad sources

PDF extraction now uses actual page text and rejects empty or marker-only content. PDFs are limited to 5 MB and 100 pages; extracted text is limited to 500,000 characters. API preflight and workers share the same splitter and 1,000-chunk cap, so accepted 500,000-character text is not later rejected by a smaller worker limit. A scanned PDF needs an OCR text version; OCR has not been added.

Permanent ingestion failures populate `Document.failureReason`; replacement clears it. Source streams have cancellation and byte caps through body consumption. YouTube cached transcripts are schema-checked and must match the requested video; cache operations have a bounded wait. Temporary Gemini media files are deleted even on transcription failure.

Existing completed records containing only blank/page-marker chunks are excluded from answers but are not automatically changed by deployment. Review a dry run:

```powershell
# From backend/, reads the configured database without changing documents.
bun run scripts/reindexUnreadableSources.ts
# After reviewing the affected IDs, explicitly opt into rebuilding only those sources.
bun run scripts/reindexUnreadableSources.ts --apply
```

The apply mode locks and rechecks each source version, clears only its unreadable chunks, and marks it pending for normal queue recovery. Original S3 objects remain intact. A genuinely blank/scanned source will fail with an actionable reason instead of producing a misleading answer. This cleanup is separate from the additive schema migration.

## Run locally on Windows

Start PostgreSQL with pgvector and Redis. Copy the root `.env.example` values into `backend/.env`, replacing Docker-only hosts `db`/`redis` with your local host/ports. Configure real Clerk, S3 and Gemini credentials; keep secrets out of frontend variables. `DATABASE_URL` is used by both API and worker. Set `FRONTEND_URL=http://localhost:5173` for Vite development.

```powershell
cd E:\docsense\backend
bun install
bunx prisma generate
bunx prisma migrate deploy
bun run dev
```

The API listens on port 5000. The in-process worker starts by default (`RUN_WORKER=true`), so a separate worker command is unnecessary in that mode. `/health` checks database, cache, queue and worker readiness; `/live` checks the HTTP process. For a separate worker, set `RUN_WORKER=false` on the API and run `bun run start:worker` with the same service configuration.

In another terminal:

```powershell
cd E:\docsense\frontend
npm install
# frontend/.env: VITE_API_URL=http://localhost:5000/api
# frontend/.env: VITE_CLERK_PUBLISHABLE_KEY=<same Clerk instance's public key>
npm run dev
```

Apply migration `20261006010000_processing_failure_reason` to the actual application database before starting this version. Verification during development used a disposable database; it does not migrate your configured database or deploy the app.

## Verification and latency measurement

```powershell
# backend/
bun run typecheck
bun test tests
# Uses only synthetic policy text and configured Gemini credentials:
bun run scripts/checkAnswerPipeline.ts
bun run scripts/checkGrounding.ts
# Optional repeat samples, including synthetic background embedding contention:
bun run scripts/benchmarkAnswerPipeline.ts --iterations=5
# frontend/
bun test tests
npm run lint
npm run build
```

Database/queue integration setup is documented in [DEPLOYMENT.md](./DEPLOYMENT.md). It uses real PostgreSQL, pgvector, locks and BullMQ with mocked AI/S3, and refuses remote targets. Live scripts make real provider calls but perform no database/S3 writes and do not print API keys or user documents.

Measure stage timings and embedding queue wait separately. Repeat representative questions with and without ingestion; compare median/p95, failures, source coverage and unsupported-claim rates before changing models, deadlines, retrieval thresholds or rewrite settings. A handful of synthetic smoke calls is not a production latency benchmark. Avoid logging user questions, retrieved source contents, generated answers or hidden thinking tokens.

During local verification on October 6, four synthetic provider/queue samples succeeded: approximately 9.1–19.8 seconds total, including 1.1–1.7 seconds for generation. Input classification took 3.0–8.3 seconds and output classification 2.1–8.8 seconds. With two background embeddings queued, the interactive embedding ran ahead of the second background request and spent about one second waiting. Two samples per condition do not establish production p95 or a speed improvement; provider latency varied substantially. Separate live probes confirmed abstention for missing facts, resistance to an injected source instruction and rejection of a contradictory claim.

## Google documentation used

- [Troubleshooting and bounded retries](https://ai.google.dev/gemini-api/docs/troubleshooting)
- [Structured output and application validation](https://ai.google.dev/gemini-api/docs/structured-output)
- [Project-level rate limits](https://ai.google.dev/gemini-api/docs/rate-limits)
- [Embedding task instructions and migration compatibility](https://ai.google.dev/gemini-api/docs/embeddings)
