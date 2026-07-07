# Base image
FROM oven/bun:1.3-slim AS base
WORKDIR /usr/src/app

# Install development dependencies (needed for Prisma client generation)
FROM base AS install
RUN mkdir -p /temp/dev
COPY package.json bun.lock /temp/dev/
RUN cd /temp/dev && bun install --frozen-lockfile

# Install production dependencies
RUN mkdir -p /temp/prod
COPY package.json bun.lock /temp/prod/
RUN cd /temp/prod && bun install --frozen-lockfile --production

# Generate Prisma Client
FROM base AS prerelease
COPY --from=install /temp/dev/node_modules node_modules
COPY . .
# Run prisma generate to build the database client
RUN bunx prisma generate

# Release image
FROM base AS release
# Expose the backend port
EXPOSE 5000

# Set environment to production
ENV NODE_ENV=production

# Copy necessary production files with bun user permissions
COPY --from=install --chown=bun:bun /temp/prod/node_modules node_modules
COPY --from=prerelease --chown=bun:bun /usr/src/app/src src
COPY --from=prerelease --chown=bun:bun /usr/src/app/prisma prisma
COPY --from=prerelease --chown=bun:bun /usr/src/app/package.json package.json
COPY --from=prerelease --chown=bun:bun /usr/src/app/prisma.config.ts prisma.config.ts

# Switch to non-root user
USER bun

# Include a health check using Bun's native fetch API
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD bun -e "fetch('http://localhost:5000/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

# Run migrations automatically, then start the server
CMD ["sh", "-c", "bunx prisma migrate deploy && bun run src/server.ts"]
