# yummy-chat

A ChatGPT-like chat application monorepo powered by Bun, Turbo, Next.js, Hono, and Drizzle/Postgres.

## Stack

| Layer        | Technology                              |
| ------------ | --------------------------------------- |
| Monorepo     | [Bun](https://bun.sh) + [Turbo](https://turbo.build) |
| Frontend     | [Next.js](https://nextjs.org) (App Router) |
| Backend      | [Hono](https://hono.dev) on Bun        |
| Database     | [Postgres](https://postgresql.org) + [Drizzle](https://orm.drizzle.team) |
| Auth         | [Better Auth](https://better-auth.com) |
| LLM          | [Vercel AI SDK](https://ai-sdk.dev)    |
| Linting      | [Biome](https://biomejs.dev)           |
| Language     | TypeScript (strict)                     |

## Project Structure

```
yummy-chat/
├── apps/
│   ├── fe/          # Next.js frontend
│   └── be/          # Hono API backend
├── packages/
│   ├── db/          # Drizzle schema, migrations, client
│   ├── shared/      # Shared types, schemas, contracts
│   └── config/      # Shared tooling configuration
├── scripts/         # Root-level utility scripts
├── .env.example     # Required environment variables
├── turbo.json       # Turbo task pipeline
├── tsconfig.base.json # Shared TypeScript config
└── biome.jsonc      # Biome linter/formatter config
```

## Prerequisites

- [Bun](https://bun.sh) >= 1.2
- Node.js >= 20 (for LSP and editor tooling)
- Docker (optional, for Postgres and Docker Compose)

## Getting Started (Local Dev — No Docker Required for FE/BE)

```bash
# 1. Install dependencies
bun install

# 2. Copy environment variables
cp .env.example .env
# Edit .env with your values (defaults work for local dev)

# 3. Start Postgres (optional — Docker convenience)
bun run dev:db        # docker compose up -d postgres

# 4. Create database tables and seed test data
bun run db:reset      # drops + recreates schema, runs migrations, seeds data

# 5. Validate environment
bun run check-env

# 6. Start FE (Next.js on :3000) + BE (Hono on :3001) dev servers
bun run dev
```

> **Docker is optional.** Only Postgres is recommended via Docker (`bun run dev:db`).
> FE and BE run natively via Bun/Next.js — no Docker Compose needed for them.

### Local Dev Workflow

| Step | Command                    | What it does                               |
| ---- | -------------------------- | ------------------------------------------ |
| DB   | `bun run dev:db`           | Start Postgres in Docker (detached)       |
| DB   | `bun run db:migrate`       | Apply pending Drizzle migrations           |
| DB   | `bun run db:seed`          | Insert test users, skills, conversations   |
| DB   | `bun run db:reset`         | Drop all data → migrate → seed (fresh)     |
| Run  | `bun run dev`              | Start FE + BE concurrently via Turbo       |
| Test | `bun run smoke:local`      | Verify env, DB, BE health, FE reachable    |

### Resetting Your Local Database

```bash
bun run db:reset    # drops everything, re-migrates, re-seeds
```

This is safe for `development` and `test` environments only (guarded by `APP_ENV`).

## Available Commands

| Command            | Description                                     |
| ------------------ | ----------------------------------------------- |
| `bun run dev`      | Start all dev servers (FE + BE)                  |
| `bun run dev:db`   | Start Postgres via Docker (`docker compose up -d postgres`) |
| `bun run build`    | Build all packages and apps                      |
| `bun run lint`     | Run Biome across workspace                       |
| `bun run typecheck`| Run TypeScript type checking                     |
| `bun run test`     | Run all tests                                    |
| `bun run check`    | Lint + typecheck (CI gate)                       |
| `bun run check-env`| Validate environment variables                   |
| `bun run format`   | Format all files with Biome                      |
| `bun run db:migrate`| Apply pending Drizzle migrations                |
| `bun run db:seed`  | Insert seed data (test users, conversations)     |
| `bun run db:reset` | Drop → migrate → seed (fresh slate)              |
| `bun run smoke:local`| Run local smoke checks (env, DB, BE, FE)        |

## Post-MVP Deferrals

The following features are intentionally deferred from the initial MVP to keep scope focused and avoid premature investment:

| Feature | Rationale |
| ------- | --------- |
| **pgvector / Semantic Memory** | Vector similarity search for memory entries. Deferred because it requires the `pgvector` Postgres extension, additional indexing strategy, and a real LLM embedding pipeline. The current key-value memory model suffices for MVP. |
| **Real OAuth Providers (Google, GitHub, etc.)** | Better Auth supports them out of the box, but wiring each provider requires OAuth app registration, callback URLs per environment, and UI for provider selection. Credential-only auth is simpler for MVP. |
| **Distributed Redis-backed Rate Limiting & Sessions** | Current rate limiting is in-memory (per-process). Moving to Redis adds operational complexity and is only needed when horizontally scaling BE instances. |
| **Advanced Tools (Web search, file upload, code execution)** | Tool-use infrastructure is designed in the contracts layer but not wired in the UI or BE. Post-MVP, each tool requires independent integration, sandboxing, and UX design. |
| **E2E AI-response assertions** | End-to-end tests that assert LLM response content are inherently flaky and costly (real API calls). Deferred until a deterministic mock LLM provider is built. |
| **Admin Dashboard** | User management, usage analytics, and audit log browsing belong in a separate admin app. Not needed for the chat MVP. |
| **Multi-tenancy / Organizations** | The schema has an `organization_id` foreign key on several tables, but multi-org routing, invite flows, and billing are not implemented. |

## Environment Variables

See `.env.example` for all required variables.

Key variables:

- `DATABASE_URL` — Postgres connection string
- `BETTER_AUTH_SECRET` — Auth encryption secret
- `LLM_PROVIDER_API_KEY` — API key for LLM provider (optional)
- `APP_ENV` — Current environment (`development`, `staging`, `production`)
