# ── Stage 1: Install dependencies ────────────────────────────────────────────
FROM oven/bun:1-alpine AS deps
WORKDIR /app

# Copy package files for the whole monorepo
COPY package.json bun.lock ./
COPY apps/be/package.json ./apps/be/
COPY packages/shared/package.json ./packages/shared/
COPY packages/db/package.json ./packages/db/

RUN bun install --frozen-lockfile

# ── Stage 2: Production runtime ─────────────────────────────────────────────
FROM oven/bun:1-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3001

# Install curl for health checks
RUN apk add --no-cache curl

RUN addgroup -S yummy && adduser -S yummy -G yummy

# Copy dependencies and source
COPY --from=deps --chown=yummy:yummy /app/node_modules ./node_modules
COPY --from=deps --chown=yummy:yummy /app/apps/be/node_modules ./apps/be/node_modules
COPY --from=deps --chown=yummy:yummy /app/packages ./packages
COPY --chown=yummy:yummy apps/be/ ./apps/be/
COPY --chown=yummy:yummy tsconfig.base.json ./

USER yummy

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3001/api/v1/health || exit 1

CMD ["bun", "run", "apps/be/src/index.ts"]
