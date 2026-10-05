# Deploying the reliability changes

The workspace changes do not update Vercel or Render automatically.

## Database and backend

Deploy the backend migration before starting the changed API and workers:

```sh
bun install --frozen-lockfile
bunx prisma generate
bunx prisma migrate deploy
bun run start
```

The Docker image runs migrations before starting the API and includes the Prisma CLI as a production dependency. Stop older workers during this rollout: they do not check source versions. The new migration clears chunks only for documents with duplicate chunk positions, marks those documents pending, and reindexes them from their stored source through queue recovery. Original S3 files remain intact.

Set `DATABASE_URL`, `REDIS_URL`, `BULLMQ_REDIS_URL`, Clerk keys, S3 configuration, and Gemini keys in the host's environment. The API and processing worker use `DATABASE_URL`; the old `WORKER_DATABASE_URL` variable is no longer used for failure status updates. Optional query, guardrail, and embedding keys fall back to `GEMINI_API_KEY` when omitted. Separate keys in the same Google project share quotas.

Set `FRONTEND_URL=https://docsense-app.vercel.app` (no trailing slash). Add other exact origins separated by commas only when needed. Set `SUPADATA_API_KEY` to use the transcript provider. `EMBEDDING_MIN_INTERVAL_MS` defaults to 1000; adjust it to the project's actual embedding quota. This pacing is per process, so additional workers increase aggregate usage.

## Worker options

`RUN_WORKER=true` is the default and keeps the API and worker together. For a separate background worker:

1. Set `RUN_WORKER=false` on the API service.
2. Create an always-running background service from the same backend image with the same database, queue, S3, and AI configuration.
3. Use `bun run start:worker` as its command, after migrations have been deployed.

The API checks the external worker's Redis heartbeat. It reports unready if that heartbeat expires. Queue recovery scans saved pending/processing rows every 30 seconds and creates a job when none exists. A committed document can therefore remain pending while Redis is unavailable without losing its processing intent. Failed jobs have three attempts with exponential backoff; re-uploading creates a new source version and job.

Use `/health` for readiness; it checks the database, cache, queue, and worker and returns 503 when a dependency is unavailable. `/live` checks only that the HTTP process responds. The HTTP listener starts immediately while dependency initialization retries. SIGTERM/SIGINT stop new requests and allow processing to drain within a bounded shutdown period.

An always-running host is needed for reliable background work. A free Render web service can sleep after 15 minutes without inbound traffic and take roughly a minute to wake. Code cannot remove that hosting limitation. See [Render's free-service documentation](https://render.com/docs/free).

## Frontend

Rebuild and redeploy Vercel with:

```text
VITE_API_URL=https://docsense-xtxf.onrender.com/api
VITE_CLERK_PUBLISHABLE_KEY=<key for the same Clerk instance as the backend>
```

Vite embeds these values at build time. Changing a host's runtime environment without rebuilding the frontend does not change the API URL in the deployed bundle. Document data is no longer persisted to localStorage; old shared caches are removed when authentication changes.

## Verification

```sh
# frontend
npm run lint
npm run build

# backend
bun run typecheck
bun run test
```

Unit and HTTP tests mock external accounts. To run database/queue integration tests, create temporary resources separately from your existing containers:

```sh
docker run --rm -d --name docsense-reliability-postgres -e POSTGRES_PASSWORD=docsense_test_only -e POSTGRES_DB=docsense_test -p 127.0.0.1:15432:5432 pgvector/pgvector:pg16
docker run --rm -d --name docsense-reliability-redis -p 127.0.0.1:16379:6379 redis:7-alpine

# Set DATABASE_URL to the test URL, apply migrations, then set:
# TEST_DATABASE_URL=postgresql://postgres:docsense_test_only@127.0.0.1:15432/docsense_test
# TEST_REDIS_URL=redis://127.0.0.1:16379
bun run test:integration

docker stop docsense-reliability-postgres docsense-reliability-redis
```

The integration suite refuses remote targets and requires the `docsense_test` database and Redis on port 16379. It uses real PostgreSQL locks, pgvector, migrations, and BullMQ, with mocked S3 and AI operations. Provider quotas, actual transcripts, and production Clerk/CORS configuration still require a post-deployment smoke test.
