# Use the official Bun image
FROM oven/bun:1.1-slim AS base
WORKDIR /usr/src/app

# Install dependencies (development dependencies needed for building/generating)
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
RUN bunx prisma generate

# Release image
FROM base AS release
COPY --from=install /temp/prod/node_modules node_modules
COPY --from=prerelease /usr/src/app/src src
COPY --from=prerelease /usr/src/app/prisma prisma
COPY --from=prerelease /usr/src/app/package.json package.json

# Expose backend port
EXPOSE 3000

# Set environment to production
ENV NODE_ENV=production

# Run the app
CMD [ "bun", "run", "src/server.ts" ]
