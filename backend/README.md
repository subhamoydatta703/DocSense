# DocSense Backend

The backend engine for DocSense is built on **Bun** and **Express**. It handles document management, orchestrates the ingestion pipeline, performs database vector operations, and interfaces with LLM endpoints.

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
│   │   ├── ai/           # Gemini API initialization
│   │   ├── aws/          # S3 connection client
│   │   ├── db/           # Primary database and Prisma adapter client
│   │   └── redis/        # Redis cache and BullMQ client configurations
│   ├── controllers/      # Route request handler controllers
│   │   ├── document/     # Document ingestion handlers
│   │   └── query/        # Chat and Q&A workspace handlers
│   ├── middlewares/      # Express authorization & global middlewares
│   ├── queue/            # Queue definitions and setup
│   ├── routes/           # Routing layers (upload, query endpoints)
│   │   ├── document/
│   │   └── query/
│   ├── services/         # Core business logic services
│   │   ├── document/     # Document parser and database metadata services
│   │   ├── processing/   # Pipeline task flow coordinators
│   │   ├── query/        # Context retrieval and LLM Q&A logic
│   │   ├── storage/      # S3 client wrapper for upload/download
│   │   ├── vectors/      # Cosine similarity and pgvector inserts
│   │   └── worker/       # BullMQ worker job loops
│   ├── app.ts            # Middleware integrations & route mappings
│   └── server.ts         # Application entry point
├── Dockerfile            # Container configuration (Bun 1.3-slim)
├── package.json          # Dependency packages and script maps
└── tsconfig.json         # TypeScript compiler configurations
```

---

## Local Development (Non-Docker)

Ensure you have **Bun v1.3+** installed.

### 1. Install dependencies
```bash
bun install
```

### 2. Configure variables
Configure the `.env` inside the `backend/` directory based on variables mapped in `backend/src/config`.

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
