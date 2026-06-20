# node-backend-refactor Draft

status: awaiting-approval
pending_action: write `.omo/plans/node-backend-refactor.md`
intent_routing: UNCLEAR - the request asks to "refactory this codebase to nodejs backend" and "build the one that can function well", but does not specify whether this means a framework rewrite, runtime migration, deployment target change, or API redesign. I resolved this with repo evidence and best-practice defaults instead of asking broad questions.

## User Goal

Refactor the codebase into a functioning Node.js backend after first understanding module dependencies.

## Evidence Collected

- `README.md` says the current stack is Bun + Turbo, Next.js frontend, Hono backend, Drizzle/Postgres database, Better Auth, strict TypeScript.
- `package.json` root uses Bun workspaces and root scripts: `dev`, `build`, `lint`, `typecheck`, `test`, `db:*`, `smoke:*`.
- `apps/be/package.json` backend scripts run with Bun: `dev: bun run --watch src/index.ts`, `start: bun run src/index.ts`, `test: bun test`.
- `apps/be/package.json` already includes `@hono/node-server`, and `apps/be/src/index.ts` uses `serve` from `@hono/node-server`, so Hono is already compatible with Node's HTTP server model.
- `apps/be/src/app.ts` composes middleware in order: request id, CORS, secure headers, session, logging, then `createApiRouter(auth)`, OpenAPI, Scalar docs, error/not-found handlers.
- `apps/be/src/routes/index.ts` mounts routes from `packages/shared/src/routes.ts`: health, auth, conversations, messages, conversation skill, skills, chat, memory.
- `apps/fe/src/lib/api.ts`, `apps/fe/src/lib/auth-client.ts`, `apps/fe/src/lib/auth-server.ts`, and `apps/fe/src/components/chat/use-stream-chat.ts` call shared `API_V1` route constants. `apps/fe/next.config.ts` proxies `/api/v1/*` to `API_BASE_URL ?? http://localhost:3001`.
- `packages/shared/package.json` and `packages/db/package.json` export `./src/index.ts` directly. This works in Bun/Next bundling but is unsafe for plain Node runtime after TypeScript compilation unless exports point to built JS.
- `packages/db/src/client.ts` reads `process.env.DATABASE_URL` and creates a `postgres` + Drizzle client; route repositories import `db` from `@yummy/db`.
- `apps/be/src/lib/repositories.ts` is the database dependency hub for conversations, messages, skills, memory, and conversation skill snapshots.
- `apps/be/src/lib/chat/orchestrator.ts` depends on repositories, `@yummy/db/schema`, and an LLM provider abstraction; chat routes depend on the orchestrator.
- `apps/be/src/lib/env.ts` already uses `process.env`, so environment handling is Node-compatible.
- `apps/be/tsconfig.json` currently includes `types: ["bun"]`; backend tests import `bun:test`, so test migration is part of a true Node backend refactor.
- `apps/be/Dockerfile` uses `oven/bun` and runs `bun run apps/be/src/index.ts`; runtime image must change for Node.
- `docker-compose.yml` starts Postgres, BE, and FE; BE health is `http://localhost:3001/api/v1/health` and FE depends on BE health.
- Verification run: `bun --filter @yummy/be typecheck` passed.
- Verification run: `bun --filter @yummy/be test` produced 45 passing tests and 7 failing DB-backed suites because Postgres is not running on `localhost:5432` (`ECONNREFUSED`). Treat this as environment setup, not a confirmed code regression.
- Worktree check: `git status --short` returned no output at planning time.

## Dependency Map

- Frontend to backend: `apps/fe` calls `/api/v1/*` routes through same-origin fetch and Next rewrites. It depends on `@yummy/shared` route constants and schemas. Backend route paths must remain stable unless frontend API clients are changed in the same wave.
- Backend route layer: `apps/be/src/routes/*` depends on Hono, shared schemas/errors/brands, auth/session middleware, repositories, audit logging, and chat orchestrator.
- Backend app layer: `apps/be/src/app.ts` owns global middleware ordering, API router mounting, docs routes, and error handling. Node runtime migration should not reorder this unless tests prove it is necessary.
- Auth: `apps/be/src/lib/auth.ts`, `apps/be/src/routes/auth.ts`, and `apps/be/src/middleware/session.ts` wrap Better Auth and rely on cookies being forwarded correctly through Hono request handling.
- Persistence: `packages/db` owns Drizzle schema, DB client, migrations, and seed scripts. `apps/be/src/lib/repositories.ts` is the main consumer. Plain Node cannot import `.ts` exports from workspace packages without a runtime loader or compiled JS exports.
- Shared contracts: `packages/shared` owns route constants, Zod schemas, branded IDs, and response envelopes. Both FE and BE depend on it, so contract exports must remain stable.
- Tooling/runtime: Bun currently acts as package manager, TS runtime, test runner, and script runner. A Node backend refactor must separate these concerns: Node runtime for BE, a TS build or Node TS loader, and a Node-compatible test strategy.

## Components Ledger

1. Runtime and build packaging: make `apps/be` start under Node 20+ without Bun executing TypeScript directly.
2. Workspace package exports: make `@yummy/shared` and `@yummy/db` consumable by Node after build while preserving TypeScript types and existing FE imports.
3. Backend scripts and Docker runtime: update backend dev/start/build path and Dockerfile from Bun runtime to Node runtime.
4. Test and smoke strategy: keep existing behavior locked while migrating test execution from `bun:test` or explicitly limit Node migration to production runtime if full test migration is too large.
5. Contract-preserving API behavior: keep `/api/v1` routes, auth cookies, response envelopes, OpenAPI docs, and FE rewrites compatible.
6. Database lifecycle: ensure migrations/seeding still run, then verify DB-backed API tests and smoke auth with Postgres.

## Adopted Defaults

- Default 1: Treat this as a Node.js runtime/tooling refactor, not an Express/Nest rewrite. Rationale: backend already uses Hono with `@hono/node-server`; rewriting route framework would add risk without improving Node compatibility. Reversible: yes.
- Default 2: Preserve the monorepo shape (`apps/fe`, `apps/be`, `packages/shared`, `packages/db`). Rationale: FE and BE share schemas/routes, and DB is already isolated. Reversible: yes, but unnecessary for this goal.
- Default 3: Keep Hono, Better Auth, Drizzle/Postgres, shared Zod contracts, and API paths unchanged. Rationale: these are existing functional module boundaries and have tests/contracts. Reversible: yes.
- Default 4: Prefer compiled JavaScript for production Node runtime over Node directly loading `.ts` sources. Rationale: Node 20 production deployments should not depend on Bun's TS runtime behavior; compiled workspace exports are predictable in Docker. Reversible: yes.
- Default 5: Keep Bun as the workspace package manager initially unless implementation evidence shows it blocks Node runtime. Rationale: the lockfile and scripts are Bun-based; replacing package management with npm/pnpm is a larger unrelated migration. Reversible: yes.
- Default 6: Convert only backend-relevant test/runtime scripts needed for confidence; do not rewrite frontend tests unless they block backend migration. Rationale: frontend API clients should remain stable. Reversible: yes.

## Open Risks

- Node build may expose ESM import-extension issues across workspace packages because source imports already use a mix of package imports and local `.js` specifiers.
- Current package exports point to `src/*.ts`; production Node may fail unless exports are changed to `dist/*.js` and all dependent packages build in topological order.
- Backend tests currently use `bun:test`; a full Node test migration may be larger than the runtime migration. The plan must decide exact test runner and conversion scope.
- DB-backed verification requires Postgres running and migrated. Current test failure is environmental (`ECONNREFUSED`).
- Docker image currently uses Bun. Node runtime Docker must still install workspace dependencies and include built `packages/shared` and `packages/db` outputs.

## Recommended Approach For Plan

Write one implementation plan that migrates backend runtime to Node while preserving behavior:

1. Add/adjust backend and package build outputs so `packages/shared`, `packages/db`, and `apps/be` emit `dist` JS/types in dependency order.
2. Update package exports to resolve built JS for Node runtime while keeping TypeScript types correct.
3. Update `apps/be` scripts to use Node for production start and a Node-compatible development path (`tsx` or equivalent) if needed.
4. Remove Bun-only backend type assumptions from runtime `tsconfig` while keeping tests either temporarily Bun-based or migrated in a dedicated wave.
5. Convert backend Dockerfile to a Node runtime image that runs compiled `apps/be/dist/index.js`.
6. Verify with typecheck, build, health route under Node, DB-backed tests after Postgres/migrations, and auth/core smoke checks.

## Approval Gate

Approve this approach to write `.omo/plans/node-backend-refactor.md`. Approval writes the execution plan only; implementation should start in a follow-up `$start-work` / `start work` instruction.
