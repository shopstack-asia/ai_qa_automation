# Single image for web app + worker (scheduler, creator, orchestrator, AI testcase, execution with Playwright).
# Requires: DATABASE_URL, REDIS_URL. Optional: OPENAI_API_KEY, JWT_SECRET, ENCRYPTION_KEY, S3_*, etc.
# Run web:  docker run ... ai-qa-platform
# Run worker: docker run ... ai-qa-platform npm run worker

# Playwright image includes Node + Chromium and system deps (match Playwright version in package.json).
ARG PLAYWRIGHT_IMAGE=mcr.microsoft.com/playwright:v1.49.0-noble
FROM ${PLAYWRIGHT_IMAGE} AS base
WORKDIR /app

# Install deps (include dev so tsx is available for worker at runtime).
COPY package.json package-lock.json* ./
RUN npm ci

COPY . .

# Generate Prisma client and build Next.js.
RUN npx prisma generate
ENV NEXT_TELEMETRY_DISABLED=1
# Dummy env vars so build can complete without real DB/Redis (routes short-circuit when NEXT_PHASE=phase-production-build).
ENV DATABASE_URL=postgresql://build:build@127.0.0.1:5432/build
ENV REDIS_URL=redis://127.0.0.1:6379
RUN npm run build

# Default: run Next.js (DB push + seed + start). Override CMD to run worker.
# For production you may want: prisma migrate deploy && next start (no seed).
CMD ["npm", "start"]
