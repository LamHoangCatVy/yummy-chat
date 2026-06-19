# learnings — yummy-chat-monorepo

## Todo 1: Root Bun/Turbo monorepo foundation

### Created files
| File | Purpose |
|------|---------|
| `package.json` | Bun workspace root; `packageManager` pinned to `bun@1.2.4`; engines `bun>=1.2`, `node>=20`; workspaces `apps/*` and `packages/*` |
| `turbo.json` | Pipeline: build (cached), dev (persistent, no cache), lint, typecheck, test, check-env |
| `tsconfig.base.json` | ES2022, ESNext/bundler, strict, verbatimModuleSyntax, composite, incremental |
| `biome.jsonc` | v1.9.4; space/2/100; noExplicitAny error, noNonNullAssertion error, noDefaultExport warn, useImportType error |
| `.gitignore` | node_modules, .next, dist, .turbo, .env, coverage, etc. |
| `.env.example` | DATABASE_URL, BETTER_AUTH_SECRET, BETTER_AUTH_URL, LLM_PROVIDER_API_KEY (optional), APP_ENV |
| `scripts/check-env.ts` | Reads `.env.example` keys, checks `process.env`, exits 0 if all required set |
| `README.md` | Stack summary, structure, setup instructions, command reference |

### Verification results
- `bun install` → 9 packages installed; `bun.lock` created (no npm/yarn lockfiles)
- `bun install --frozen-lockfile` → "Checked 9 installs across 22 packages (no changes)" ✓
- `bun run check-env` with missing vars → exits 1, prints ❌ per missing key
- `bun run check-env` with all required vars → exits 0, prints ✅
- `bun run check` → turbo runs lint + typecheck across 0 packages (no apps/packages yet)

### Notable decisions
- Used `bun@1.3.14` (actual installed version, not the pinned 1.2.4 — pin is advisory)
- Turbo v2.9.18 installed, Biome 1.9.4, TypeScript 5.9.3
- `check-env.ts` uses `import.meta.dir` (Bun ESM) to locate `.env.example`
- Optional var detection: value is `""`, `''`, empty, or comment line contains "optional"
- All vars in `.env.example` use double-quoted string values

## Todo 2: Root DESIGN.md

### Created files
| File | Purpose |
|------|---------|
| `DESIGN.md` | Living design system document defining atmosphere, color (token-based with light/dark values), typography (Geist + Geist Mono, Display to Overline), spacing (base-4, responsive breakpoints 640/768/1024/1280), components (chat bubble, sidebar, composer, skill selector, memory panel), motion (micro/standard/emphasis/scroll-driven timing), and depth (tonal-shift strategy) |

### Key decisions
- **Depth strategy**: tonal-shift (no box shadows). Surfaces differ by one step in lightness/darkness. Consistent across light and dark modes.
- **Icon library**: Lucide (tree-shakeable SVG via `lucide-react`).
- **Primary font**: Geist + Geist Mono (Vercel typeface, matches Next.js ecosystem).
- **Base unit**: 4px spacing system (tokens `spacing-{n}` where value is `n * 4px`).
- **Color accent**: Blue (`#3B82F6` light / `#60A5FA` dark) as primary accent; indigo as secondary. Deliberately avoids OpenAI green/ChatGPT purple.
- **Token naming**: `role-variant` pattern (e.g., `surface-primary`, `text-secondary`, `border-subtle`). Semantic, not presentational.
- **Emojis banned** as icons. Only Lucide SVG icons permitted for UI iconography.
- **Atmosphere**: Neutral command center. The conversation is the hero. No decorative elements without purpose. No OpenAI/ChatGPT branding.

## Todo 3: packages/shared — shared type-safe contracts

### Created files
| File | Purpose |
|------|---------|
| `packages/shared/package.json` | `@yummy/shared`, type module, main/exports → `src/index.ts`, zod ^4.0.0 dep |
| `packages/shared/tsconfig.json` | Extends root `tsconfig.base.json`, outDir `./dist`, rootDir `./src` |
| `packages/shared/src/brands.ts` | `Brand<T, B>` phantom type via `declare const __brand: unique symbol`; exports `UserId`, `ConversationId`, `MessageId`, `SkillId`, `MemoryId`, `SessionId` |
| `packages/shared/src/errors.ts` | `YummyError` discriminated union (7 variants): `ValidationError`, `AuthError`, `NotFoundError`, `ForbiddenError`, `RateLimitError`, `InternalError`, `UnsupportedMediaTypeError` |
| `packages/shared/src/response.ts` | `ApiResponse<T>` (success envelope) and `ApiErrorResponse` (error envelope), both with `meta: { timestamp, requestId }` |
| `packages/shared/src/routes.ts` | `API_V1` const object: AUTH, CHAT, CONVERSATIONS, SKILLS, MEMORY, HEALTH — all under `/api/v1/` |
| `packages/shared/src/schemas.ts` | Zod v4 schemas: `chatMessageSchema`, `conversationSchema`, `skillSchema`, `memoryEntrySchema`, `sendMessageInputSchema`, `sendMessageResponseSchema`, `createConversationInputSchema`, `conversationListResponseSchema`, `skillListResponseSchema`, `memoryListResponseSchema`, `healthResponseSchema`; plus inferred type aliases |
| `packages/shared/src/index.ts` | Barrel re-export: types via `export type { ... }`, values via `export { ... }` |
| `packages/shared/src/index.test.ts` | 37 tests: schema valid/invalid, branded ID safety, error exhaustiveness via `assertNever()`, route prefix consistency |

### Verification results
- `bun --filter @yummy/shared test` → 37 pass, 0 fail, 54 expect() calls ✓
- `bun --filter @yummy/shared typecheck` → exit 0 ✓
- zod@4.4.3 installed

### Notable decisions
- **Branded type pattern**: `declare const __brand: unique symbol; type Brand<T, B> = T & { readonly [__brand]: B }` — phantom property, compile-time only
- **UUID brand helper**: `const uuidBrand = <T>(): z.ZodType<T> => z.string().uuid() as unknown as z.ZodType<T>` — casts Zod string schema to branded type schema
- **Zod v4 API difference**: `z.number().nonneg()` does not exist in v4; use `z.number().gte(0)` instead
- **verbatimModuleSyntax**: requires `import type` for type-only imports; branded types used in `z.ZodType<UserId>` are type-only → must use `import type` for brand imports in schemas.ts
- **Test branded types**: `expect().toBe()` uses `NoInfer<>` which prevents implicit widening → must cast UUID string constants to branded types at assertion sites (e.g., `expect(result.id).toBe(UUID as MessageId)`)
- **satisfies with branded types**: object literals must cast UUID fields to branded types before `satisfies ChatMessage` (e.g., `id: UUID as MessageId`)
- **No default exports**: all modules use named exports only, consistent with Biome `noDefaultExport` rule
- **readonly everywhere**: all interface properties use `readonly` modifier, consistent with immutable data philosophy

## Todo 5: apps/be — Hono TypeScript API skeleton

### Created files
| File | Purpose |
|------|---------|
| `apps/be/package.json` | `@yummy/be`, type module, deps: hono 4.12, hono-openapi 1.3, @scalar/hono-api-reference 0.7.5, @hono/node-server, @hono/standard-validator, zod 4, @yummy/shared workspace:* |
| `apps/be/tsconfig.json` | Extends root tsconfig.base.json, types: ["bun"] (not "bun-types" — that package doesn't exist; @types/bun is at root) |
| `apps/be/src/index.ts` | Bun entry using @hono/node-server `serve()` with `app.fetch`, reads port from env |
| `apps/be/src/app.ts` | Hono app factory: middleware chain (request-id → cors → secure-headers), API routes, OpenAPI spec at `/api/v1/openapi.json`, Scalar docs at `/api/docs`, error + notFound handlers |
| `apps/be/src/lib/env.ts` | Typed env with lazy getters (won't throw at import time); required vars: DATABASE_URL, BETTER_AUTH_SECRET, BETTER_AUTH_URL; optional: LLM_PROVIDER_API_KEY, APP_ENV, PORT, CORS_ORIGINS |
| `apps/be/src/middleware/request-id.ts` | Reads `x-request-id` header or generates UUID via `node:crypto.randomUUID()`, stores in c.set("requestId"), echoes in response header |
| `apps/be/src/middleware/error-handler.ts` | `handleError` (ErrorHandler) checks if err is YummyError (has type+statusCode+message), wraps in ApiErrorResponse envelope; `handleNotFound` returns 404 NOT_FOUND_ERROR |
| `apps/be/src/middleware/cors.ts` | CORS middleware factory reading origins from env.corsOrigins, credentials: true, exposes X-Request-Id + Retry-After |
| `apps/be/src/middleware/secure-headers.ts` | Re-exports Hono's `secureHeaders()` (X-Content-Type-Options, X-Frame-Options, HSTS, etc.) |
| `apps/be/src/middleware/rate-limit.ts` | Generic in-memory rate limiter factory with configurable windowMs/maxRequests/keyFn; pre-built `authRateLimiter` (5/min/IP) and `chatRateLimiter` (30/min/user); cleanup interval with unref() |
| `apps/be/src/routes/health.ts` | GET `/api/v1/health` with hono-openapi `describeRoute` metadata; returns ApiResponse envelope with status/version/timestamp + meta.requestId |
| `apps/be/src/routes/index.ts` | Router aggregator mounting healthRouter at API_V1.HEALTH |
| `apps/be/src/app.test.ts` | 7 tests: health shape, X-Request-Id header, client-provided request ID echo, ISO timestamp, 404 envelope, 404 request ID, security headers |

### Verification results
- `bun --filter @yummy/be typecheck` → exit 0 ✓
- `bun --filter @yummy/be test` → 7 pass, 0 fail, 11 expect() calls ✓
- `curl http://localhost:3001/api/v1/health` → 200, correct JSON shape, X-Request-Id UUID header ✓
- `curl http://localhost:3001/api/v1/openapi.json` → valid OpenAPI 3.1.0 spec with health path ✓
- `curl http://localhost:3001/api/docs` → Scalar HTML page with "Yummy Chat API" title ✓

### Notable decisions
- **hono-openapi over @hono/zod-openapi**: `@hono/zod-openapi` requires zod 3.* as peer dep, but shared package uses zod 4. `hono-openapi` uses Standard Schema v1 (which zod 4 implements natively), so no version conflict
- **hono-openapi peer deps**: requires `@hono/standard-validator` (installed as dep) and `openapi-types` (transitive)
- **Scalar config**: `spec: { url }` is deprecated; use `url` at top level: `apiReference({ url: "/api/v1/openapi.json" })`
- **tsconfig types**: use `"types": ["bun"]` not `"types": ["bun-types"]` — the `@types/bun` package is at root, `bun-types` doesn't exist as a separate package
- **Lazy env**: env vars use getters so tests can import modules without all required vars being set (only accessed vars throw)
- **ErrorHandler type**: Hono's `ErrorHandler` type is `(err: Error, c: Context) => Response | Promise<Response>`; `notFound` handler takes `Context` directly
- **Rate limiter cleanup**: `setInterval().unref()` prevents the cleanup timer from keeping the process alive in tests
- **Named exports only**: all modules use named exports, no `export default`

## Todo 4: packages/db — Drizzle/Postgres schema, migrations, client

### Created files
| File | Purpose |
|------|---------|
| `packages/db/package.json` | `@yummy/db`, type module, deps: drizzle-orm ^0.44, postgres ^3.4; devDeps: drizzle-kit ^0.31, typescript, @types/bun |
| `packages/db/tsconfig.json` | Extends root `tsconfig.base.json`, outDir `./dist`, rootDir `./src` |
| `packages/db/drizzle.config.ts` | Postgres dialect, schema `./src/schema`, out `./drizzle` |
| `packages/db/src/schema/auth.ts` | Better Auth compatible: `user`, `session`, `account`, `verification` tables + relations |
| `packages/db/src/schema/chat.ts` | `conversation`, `message` tables + relations (message self-ref via parentId) |
| `packages/db/src/schema/skills.ts` | `skill`, `conversationSkillSnapshot` tables + relations |
| `packages/db/src/schema/memory.ts` | `memoryEntry`, `userMemorySettings` tables + relations |
| `packages/db/src/schema/audit.ts` | `auditEvent` table (no relations, userId is nullable text) |
| `packages/db/src/schema/usage.ts` | `usageRecord` table + relations |
| `packages/db/src/schema/index.ts` | Barrel re-export of all schema modules |
| `packages/db/src/client.ts` | Drizzle client factory using `postgres.js`, exports `db` and `sql` |
| `packages/db/src/migrate.ts` | Migration runner script using `drizzle-orm/postgres-js/migrator` |
| `packages/db/src/seed.ts` | Deterministic seed with APP_ENV guard (test/development only), idempotent via existence check |
| `packages/db/src/index.ts` | Barrel export: `db`, `sql`, all schema tables/relations |
| `packages/db/src/client.test.ts` | 3 tests: migration idempotency, duplicate email constraint, orphan message FK constraint |
| `packages/db/drizzle/0000_sleepy_menace.sql` | Generated migration: 12 tables, 9 FK constraints |

### Verification results
- `bun --filter @yummy/db db:generate` → 12 tables detected, migration SQL generated ✓
- `bun --filter @yummy/db db:migrate:test` → migrations complete, exit 0 ✓
- `bun --filter @yummy/db test` → 3 pass, 0 fail, 14 expect() calls ✓
- `bun --filter @yummy/db typecheck` → exit 0 ✓
- `bun --filter @yummy/db lint` → 12 files checked, 0 errors ✓

### Notable decisions
- **`text('id').default(sql\`gen_random_uuid()\`).primaryKey()`**: `defaultRandom()` only exists on `uuid()` columns in drizzle-orm v0.44, NOT on `text()` columns. Must use `sql\`gen_random_uuid()\`` as default for text PKs. Method order matters: `.default()` before `.primaryKey()`.
- **Drizzle migration metadata schema**: `drizzle-kit migrate` creates a `drizzle` schema with `__drizzle_migrations` table. When testing, must `DROP SCHEMA IF EXISTS drizzle CASCADE` alongside `DROP SCHEMA public CASCADE` — otherwise migration thinks it already ran but tables don't exist.
- **postgres.js NOTICE messages**: Postgres emits NOTICE-level messages (e.g., "schema already exists, skipping") which appear in test output. These are informational, not errors.
- **Biome `useLiteralKeys`**: `process.env["DATABASE_URL"]` triggers lint error; use `process.env.DATABASE_URL` instead.
- **Biome `organizeImports`**: imports from `drizzle-orm` must come before `drizzle-orm/pg-core` (alphabetical by module path).
- **Biome format**: chained column methods like `.notNull().defaultNow()` fit on one line when under 100 chars; Biome collapses multi-line chains.
- **bun:test `toInclude`**: `expect(array).toInclude(value)` did NOT work for string arrays in bun v1.3.14. Use `expect(array.includes(value)).toBe(true)` instead.
- **bun:test `rejects.toThrow()`**: caused test timeout (5s). Used try/catch with boolean flag pattern instead: `let threw = false; try { await ... } catch { threw = true }; expect(threw).toBe(true)`.
- **Better Auth schema**: table names are `user`, `session`, `account`, `verification` (singular). Column names use camelCase in Drizzle mapping to snake_case in DB (e.g., `emailVerified` → `email_verified`).
- **FK cascade deletes**: all child tables use `onDelete: "cascade"` — deleting a user cascades to sessions, accounts, conversations, messages, memory entries, usage records.
- **drizzle-orm v0.44.7 + drizzle-kit v0.31.10**: compatible pair. `drizzle-kit generate` reads schema TS files directly (doesn't need compilation).
