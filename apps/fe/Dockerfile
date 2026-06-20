# ── Stage 1: Install dependencies ────────────────────────────────────────────
FROM node:22-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Copy package files for the whole monorepo
COPY package.json package-lock.json ./
COPY apps/fe/package.json ./apps/fe/
COPY packages/shared/package.json ./packages/shared/
COPY packages/db/package.json ./packages/db/

# Install production + dev deps needed for build
RUN npm ci

# ── Stage 2: Build Next.js ──────────────────────────────────────────────────
FROM deps AS builder
WORKDIR /app

# API base URL baked into standalone rewrites at build time
ARG API_BASE_URL=http://be:3001
ENV API_BASE_URL=${API_BASE_URL}
ENV NEXT_TELEMETRY_DISABLED=1

# Copy source
COPY apps/fe/ ./apps/fe/
COPY packages/ ./packages/
COPY tsconfig.base.json turbo.json biome.jsonc ./

RUN npm run build -w @yummy/fe

# ── Stage 3: Production runtime ─────────────────────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

RUN apk add --no-cache wget
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy standalone output
COPY --from=builder /app/apps/fe/.next/standalone ./
COPY --from=builder /app/apps/fe/.next/static ./apps/fe/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/fe/public ./apps/fe/public

USER nextjs

EXPOSE 3000

HEALTHCHECK --interval=10s --timeout=5s --start-period=20s --retries=5 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/login || exit 1

CMD ["node", "apps/fe/server.js"]
