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

Generation uses JSON Schema with application validation. Every claim needs a known chunk ID and a verbatim quote; invented references, fabricated quotes and numeric values absent from the evidence cause abstention. Numeric validation excludes prose Markdown list markers and normalizes English whole-number words and percent notation. Literal code numbers still need evidence. This is a numeric provenance check, not a unit or entailment proof; the output classifier still checks semantic support, negations, units and qualifications. Other languages, spoken decimals, locale-specific numeric conventions and ordinal paraphrases are not normalized. The server supplies citation markers. Quotes and titles are also classified because they appear in the browser. Source ownership, status and version are checked again before publishing.

These checks reduce unsupported answers; they do not prove semantic correctness or guarantee zero hallucinations. Exact quotes can be misinterpreted, a model classifier can err, and relevant passages may be missed by retrieval. Users should inspect the quoted evidence for important decisions.

Focused questions retain five usable passages and the cosine-distance threshold of 0.4. Retrieval examines candidate pages of at least 50 rows, skips unreadable text before filling those five slots, and stops after 20 pages with an explicit reprocessing error if the index is too damaged. Focused library retrieval gives each source's best matching chunk priority before its additional chunks. Answers disclose that selected passages may omit other sources or exceptions. The response's optional `coverage` string is displayed separately from the cited claims.

Summaries, main-findings requests, comparisons, and explicit exhaustive requests use complete ordered context up to 30 chunks and 30,000 characters, either for a selected document or all the user's ready sources. Larger scopes receive an explicit request to narrow the question instead of presenting a nearest-five sample as complete. A broad library answer also checks that every ready source contributed readable text and rechecks the complete source/version set before publishing. Numbered-section requests retain focused retrieval. The browser exposes both selected-source questions and **Ask all ready sources**. Intent detection remains rule based; unknown phrasings can take the focused path, whose coverage disclosure still applies. Full context and citations reduce omissions but cannot prove a model answer is exhaustive; representative recall/completeness and latency evaluation remains necessary.

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

Permanent ingestion failures populate `Document.failureReason`. Every upload creates an independent source, including repeated filenames, titles, and URLs. To replace an existing source, add the new source first, wait for Ready, and use **Replace this source** on the old source's library card. The replacement must have the same source type. The old source remains available while the new one processes; failed processing leaves it untouched.

`POST /api/documents/:documentId/replacement` accepts `replacementId`, `expectedSourceKey`, and `expectedReplacementKey`. It checks ownership and both versions under ordered row locks, requires readable indexed text in the completed replacement, and atomically transfers its chunks and metadata to the original document ID. The staging entry is removed. The old storage object is deleted only after commit. Cleanup failure is logged and does not reverse a successful activation; automatic durable retry of object deletion is not implemented. The existing `Document` and `DocumentChunk` tables provide staging, so this change needs no schema migration. In-flight answers using either superseded version are rejected by the existing source validation check.

Source streams have cancellation and byte caps through body consumption. YouTube cached transcripts are schema-checked and must match the requested video; cache operations have a bounded wait. Temporary Gemini media files are deleted even on transcription failure.

Website extraction now preserves block boundaries, lists, table cells/rows, and substantive article headers/sidebars while preferring main/article content. Stored website text is not repaired by deploying this parser. Review the read-only inventory with `bun run scripts/planWebsiteReindex.ts`, then re-fetch reviewed sources into separate staging uploads and activate replacements only after indexing succeeds. Sites may have changed since the original import; a re-fetch cannot reconstruct historical HTML that was never retained.

YouTube metadata has a three-second budget and falls back to a video-ID title. Transcript acquisition has a 70-second overall budget, a 35-second provider attempt and a 30-second public-caption budget. Provider 402/404/408/422/429 and 5xx failures permit one caption acquisition attempt; 401/403 configuration failures remain explicit. The scraper retains one internal retry within its budget. If both methods fail, the provider error is preserved unless the captions path supplies a rate-limit retry window. Only validated successful transcripts are cached. Supadata response bodies are capped at 6 MB. Uploaded MPEG program/video streams are recognized with structural checks and must match `video/mpeg`; container recognition does not guarantee provider decoding compatibility.

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
