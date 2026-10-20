# Source and answer pipeline audit

Reviewed 2026-10-15. Scope: PDF, website, YouTube URL, uploaded transcript/media, pasted text, source persistence, queue/worker processing, retrieval, answer validation, and browser presentation.

Application code was not changed. Findings below distinguish reproduced failures from code-path analysis. No live database, Redis, S3, or AI provider calls were used. Production source contents and provider availability were not assessed.

## 1. High: adding a different source with the same name silently destroys the previous source

Location: `backend/src/services/document/saveDocumentSource.ts:8–29`; PDF and text callers use its default replacement behavior.

For sources without a URL, identity is the user's source type plus original filename/title. Adding a second, unrelated `report.pdf`, or pasted text with the same title, finds the existing record, deletes its chunks, overwrites its S3 key, and deletes the old storage object. The upload UI presents this as adding a source and has no explicit replacement selection or disclosure.

Impact: an ordinary upload can remove previously indexed information permanently. If processing the new PDF fails, the old usable source is already gone. This also explains answers changing or disappearing after adding another document.

Evidence: confirmed by the persistence code path; the existing replacement test verifies that deletion occurs, but does not check whether the user intended replacement.

Fix: create a separate source by default. Make replacement explicit using an owned document ID and expected version. Preserve the active version until the replacement is successfully indexed.

## 2. High: the numeric evidence check rejects correctly supported answers

Location: `backend/src/services/query/answerSchema.ts:42–44,73–74`.

Every digit sequence in claim Markdown is treated as a factual numeric claim. Formatting and equivalent representations are not distinguished from unsupported facts. One rejected claim causes the entire answer to become an abstention before the output classifier runs.

Reproduced directly against `parseGroundedAnswer`:

| Verbatim evidence | Generated claim | Observed result |
| --- | --- | --- |
| `A receipt is required.` | `1. A receipt is required.` | Abstention because list marker `1` is absent from evidence |
| `Returns are accepted for thirty days.` | `Returns are accepted for 30 days.` | Abstention despite equivalent meaning |

Impact: otherwise valid answers, especially steps, lists, and numeric paraphrases, unpredictably return insufficient information. Markdown is explicitly allowed by the generation prompt.

Fix: exclude Markdown numbering from factual checks; handle equivalent numeric representations deliberately. Preserve unsupported-number detection and verify semantic support rather than removing grounding checks wholesale.

## 3. High: website extraction corrupts paragraph and table boundaries

Location: `backend/src/services/web-url/weburlService.ts:18`.

Cheerio `.text()` concatenates adjacent element text without adding layout separators. Collapsing existing whitespace afterward cannot reconstruct the missing separators.

Reproduced with compact HTML containing a heading, two paragraphs, and a table. The current extraction produced:

```text
Return policyReturns accepted.A receipt is required.PlanPriceBasic$10
```

Impact: text reaches chunking and embedding with merged words and ambiguous table associations. Retrieval and citations then operate on damaged evidence. Separately, removing all `header` and `aside` elements can remove substantive article text, not just site navigation.

Fix: extract main article content where available, insert structural separators for blocks, and preserve table row/cell relationships. Test compact HTML as well as neatly indented HTML. Existing damaged website sources need re-extraction and reindexing.

## 4. High functional gap: broad and cross-source questions have no coverage guarantee

Locations: `backend/src/services/vectors/vectorService.ts:82–108`; `backend/src/services/query/queryService.ts:24–46`; `frontend/src/components/QAWorkspace.tsx:100`.

The global query endpoint takes the nearest five chunks across all completed documents. All five may belong to one document; there is no per-document coverage, lexical retrieval, reranking, or neighboring-section expansion. The browser always supplies a single document ID, so it does not expose the global query path.

Full-context summary routing is available only for a selected document and a narrow keyword test. For example, `What are the main findings?` falls through to nearest-five retrieval. Questions requesting summaries of all sources also use nearest-five retrieval. The generator is not told which documents or portions were omitted and has no explicit completeness gate.

Impact: comparisons, exhaustive lists, and broad summaries can be presented with valid citations while omitting relevant sources, later sections, or exceptions. Citation validity does not establish answer completeness.

Evidence: confirmed routing and SQL behavior; actual recall rates require a representative retrieval evaluation. The five-chunk policy and short-summary size limits are documented constraints, not SQL execution errors.

Fix: define selected-source versus all-source query behavior explicitly. For broad questions, select sources first and obtain context across those sources with coverage accounting. Route overview intent beyond a keyword list and disclose when context is partial. Evaluate focused retrieval before tuning the distance threshold.

## 5. Medium: unreadable chunks can crowd out usable evidence before filtering

Locations: `backend/src/services/vectors/vectorService.ts:96–107`; `backend/src/services/query/queryService.ts:46–48`.

SQL applies `LIMIT 5` before `hasReadableText` filters the results in application code. The repository explicitly supports legacy completed documents with blank/page-marker chunks and provides an optional cleanup script. If five such chunks rank ahead of a readable sixth chunk within the distance threshold, the query returns an abstention without considering that readable evidence.

Impact: an existing usable answer may be missed because bad legacy vectors consume the retrieval budget.

Evidence: confirmed operation order and supported legacy-data condition; not measured against production data.

Fix: exclude known unusable chunks during retrieval or fetch additional candidates until enough valid context is found. Apply the existing unreadable-source remediation to affected records after reviewing its dry run.

## 6. Medium: YouTube metadata availability blocks a working transcript provider

Location: `backend/src/services/youtube/transcriptService.ts:215–234`.

The oEmbed metadata request must succeed before Supadata is called. A metadata error immediately aborts ingestion even when the transcript provider could return the source text. Placeholder title/channel values exist but are used only for incomplete successful metadata responses.

Reproduced with mocked external services: metadata HTTP 503 produced application status 502 and `providerCalls: 0`, despite a transcript provider stub configured to return valid text.

Impact: transient YouTube metadata failures prevent indexing independently obtainable transcripts.

Fix: treat metadata as optional enrichment. Retrieve the transcript independently and use the video ID/default title when metadata is temporarily unavailable.

## 7. Medium: the configured YouTube provider has no scraper fallback on failure

Locations: `backend/src/services/youtube/transcriptService.ts:234–270`; `backend/src/services/youtube/supadataTranscriptService.ts:30–143`.

The scraper branch runs only when `getSupadataTranscript` returns null. That function returns null only when no provider key is configured; provider failures throw. A configured provider outage, empty transcript, or exhausted credits therefore prevents any attempt to obtain otherwise accessible public captions.

Impact: enabling the optional provider removes the scraper's availability benefit. The README's provider-to-fallback description overstates the implemented behavior.

Evidence: confirmed branch and exception flow; no claim is made that every failed provider request could succeed through the scraper.

Fix: define which provider failures permit a bounded public-caption attempt, preserve appropriate errors if both paths fail, and make documentation match that policy.

## 8. Medium: advertised MPEG video uploads are rejected by signature validation

Locations: `frontend/src/api/sourceIngestion.ts:16–17`; `backend/src/middlewares/youtubeMediaUploadMiddleware.ts:14–20`; `backend/src/controllers/youtube/youtubeMediaController.ts:16–29,46`.

The frontend and upload middleware accept `.mpeg` and `video/mpeg`. The controller signature detector recognizes WAV, FLAC, Ogg, WebM, ISO media with `ftyp`, and MP3/AAC, but has no MPEG program/video stream signature branch. MPEG data beginning with `00 00 01 BA` or `00 00 01 B3` fails every branch and returns HTTP 400.

Impact: a supported format passes file selection and upload middleware, then fails before transcription.

Evidence: deterministic signature-branch analysis. No live media transcription was needed.

Fix: align the advertised format list and actual container detection. Detect and validate supported MPEG streams if they are intended to be accepted.

## Verification

- Backend unit tests: 94 passed, 0 failed.
- Frontend unit tests: 16 passed, 0 failed.
- Backend TypeScript check: passed.
- Frontend production build: passed after rerunning outside the sandbox because Vite's Windows subprocess initially failed with `EPERM`.
- Additional isolated probes reproduced numeric false abstention, lost HTML separators, summary-intent routing, and metadata blocking transcript retrieval.
- No database/queue integration suite or paid live-provider checks were run. Passing existing tests does not cover the defects above.

Recommended order: prevent silent source loss; repair numeric validation and web extraction; address broad-query coverage and candidate filtering; decouple YouTube metadata/provider fallback and align media formats. Reindex affected stored website text after extraction is fixed.
