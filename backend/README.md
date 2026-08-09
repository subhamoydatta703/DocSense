# DocSense Backend

The backend engine for DocSense is built on **Bun** and **Express**. It handles document management, orchestrates the ingestion pipeline (PDF, web URLs, YouTube sources, and raw pasted text), performs database vector operations, and interfaces with LLM endpoints.

---

## Folder Structure

```
backend/
├── prisma/               # Database schema & migrations
│   ├── generated/        # Locally generated Prisma client
│   ├── migrations/       # Database migration scripts
│   └── schema.prisma     # Prisma database schema definition
├── src/                  # Main source code directory
│   ├── config/           # Core system configurations
│   │   ├── ai/           # Gemini client instances (Q&A, query, guard, embedding)
│   │   ├── aws/          # S3 connection client
│   │   ├── db/           # Prisma clients (app + worker) with pg adapter
│   │   └── redis/        # Redis cache and BullMQ client configurations
│   ├── controllers/      # Route request handler controllers
│   │   ├── document/     # PDF upload / fetch / list / delete handlers
│   │   ├── query/        # Chat and Q&A workspace handlers
│   │   ├── text/         # Raw text ingestion handler
│   │   ├── web-url/      # Web URL ingestion handler
│   │   └── youtube/      # YouTube URL, transcript-upload & media handlers
│   ├── errors/           # Custom error types (e.g. GuardrailError)
│   ├── guardrails/       # Input & output safety classification (Gemini)
│   │   ├── input/        # Injection / jailbreak detection
│   │   └── output/       # Leakage / PII / harmful-content detection
│   ├── middlewares/      # Auth, Multer uploads, rate limiter, transcript/media upload
│   ├── queue/            # BullMQ queue definition
│   ├── routes/           # Routing layers (document, query, text, web-url, youtube)
│   │   ├── document/
│   │   ├── query/
│   │   ├── text/
│   │   ├── web-url/
│   │   └── youtube/
│   ├── services/         # Core business logic services
│   │   ├── document/     # DB metadata services
│   │   ├── processing/   # Chunk / embed / vector pipeline coordinators
│   │   ├── query/        # Guardrails, optimization, retrieval & Q&A logic
│   │   ├── storage/      # S3 client wrapper for upload/download
│   │   ├── text/         # Text document creation and duplicate override service
│   │   ├── vectors/      # Cosine similarity and pgvector inserts
│   │   ├── web-url/      # URL security & HTML-to-text extraction
│   │   ├── worker/       # BullMQ worker job loops
│   │   └── youtube/      # Transcript fetch, media transcription, storage
│   ├── utils/            # PDF parsing, URL security, Zod validation
│   ├── app.ts            # Middleware integrations & route mappings
│   └── server.ts         # Application entry point
├── Dockerfile            # Container configuration (Bun 1.3-slim)
├── package.json          # Dependency packages and script maps
└── tsconfig.json         # TypeScript compiler configurations
```

---

## Features

- **PDF ingestion** — Upload a PDF (max 5MB, 100 pages) that is stored to S3, enqueued on BullMQ, chunked via LangChain, embedded with Gemini, and indexed into `pgvector`.
- **Web URL ingestion** — Submit an HTTPS URL. The backend validates public DNS resolution (SSRF protection), fetches with redirect / size / timeout caps, extracts readable text with Cheerio, and indexes it as a `WEBSITE` source.
- **YouTube ingestion** — Three paths producing a `YOUTUBE` source: video URL transcript (Supadata provider with `youtube-transcript-plus` fallback), `.txt` transcript upload, and audio/video media transcription via the Gemini Files API.
- **Raw Text ingestion** — Type or paste document text directly. Validated with Zod (title 1–250 chars, content 20–500,000 chars), stored to S3 as a UTF-8 text file, and indexed into `pgvector` as a `TEXT` source.
- **Query pipeline** — Input guardrail → step-back query optimization → embedding → `pgvector` cosine similarity search (distance threshold) → grounded, cited answer → output guardrail.
- **Rate limiting** — Every API route is protected by a Redis-backed fixed-window counter (max 20 requests / 60s), returning `429` when exceeded.

---

## Local Development (Non-Docker)

Ensure you have **Bun v1.3+** installed.

### 1. Install dependencies
```bash
bun install
```

### 2. Configure variables
Create a `.env` file inside the `backend/` directory. The variables mapped in `backend/src/config` are used, including:

- `DATABASE_URL`, `WORKER_DATABASE_URL` — Postgres connection strings (app + worker clients)
- `REDIS_URL`, `BULLMQ_REDIS_URL` — Redis connection strings (cache/rate-limit and BullMQ broker)
- `CLERK_SECRET_KEY` — server-side authentication (`@clerk/express`)
- `GEMINI_API_KEY`, `GEMINI_EMBEDDING_API_KEY`, `GEMINI_QUERY_API_KEY`, `GEMINI_GUARD_API_KEY` — AI provider keys
- `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_S3_BUCKET_NAME` — object storage
- `FRONTEND_URL` — comma-separated allowed CORS origins
- `SUPADATA_API_KEY` — optional YouTube transcript provider key

> Never commit real secrets; use placeholders or a local-only `.env` (which is gitignored).

### 3. Run migrations
```bash
bun run db:migrate
```

### 4. Start the server
To run in development mode with watch mode:
```bash
bun run dev
```

To run in production mode:
```bash
bun run start
```

---

## API Endpoints

All routes are mounted under `/api` and require Clerk authentication plus rate limiting.

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/upload` | Upload a PDF document |
| `GET` | `/api/documents` | List the user's documents |
| `GET` | `/api/documents/:id` | Get a single document |
| `DELETE` | `/api/documents/:documentId` | Delete a document |
| `POST` | `/api/query` | Ask a question against the user's documents |
| `POST` | `/api/weburl` | Ingest a web page URL |
| `POST` | `/api/youtube` | Ingest a YouTube video via URL transcript |
| `POST` | `/api/youtube/transcript-upload` | Upload a `.txt` transcript |
| `POST` | `/api/youtube/media-upload` | Upload audio/video for transcription |
| `POST` | `/api/text` | Ingest raw pasted text document |
| `GET` | `/health` | Health check (DB connectivity) |

---

## Database Migrations

```bash
bun run db:migrate   # apply a new migration (dev)
bun run db:push      # push schema without a migration (dev)
bun run db:studio    # open Prisma Studio
```

In the container, migrations run automatically on startup via `bunx prisma migrate deploy`.
