# yummy-chat-monorepo - Work Plan

## TL;DR (For humans)
**What you'll get:** A working ChatGPT-style product foundation: authenticated users can sign in, start chats, stream assistant replies, browse conversation history, create/select LLM “skills,” and manage opt-in personal memory. It will run locally through normal dev servers and also through Docker Compose with a Postgres database.

**Why this approach:** The plan uses a split Next.js frontend and Hono backend but avoids cross-origin auth bugs by proxying API calls through the frontend origin. It builds the first complete loop with a deterministic fake LLM before real provider wiring so streaming, persistence, and tests are reliable.

**What it will NOT do:** It will not copy ChatGPT/OpenAI branding, expose database or LLM secrets to the browser, create arbitrary code-execution skills, or silently store sensitive memories. Semantic vector memory is deferred until after the structured-memory MVP works.

**Effort:** XL
**Risk:** High - greenfield full-stack app with auth, streaming, persistence, Docker, and privacy-sensitive memory.
**Decisions I made for you:** Bun workspaces + Turbo; Next.js App Router frontend; Hono backend; Drizzle + Postgres via `postgres.js`; Better Auth cookies through a single-origin Next proxy; `/api/v1` routes; structured memory first, pgvector later; strict TypeScript/Biome/TDD; no commits unless you ask later.

Your next move: run `$start-work .omo/plans/yummy-chat-monorepo.md` when you want implementation to begin. Full execution detail follows below.

---

> TL;DR (machine): XL/high-risk greenfield monorepo plan delivering Next.js FE, Hono BE, Drizzle/Postgres, Better Auth, streaming chat/history, skills, structured memory, Docker Compose, and automated QA.

## Scope
### Must have
- Create a greenfield TypeScript monorepo under the existing `yummy-chat` directory without editing planner-only `.omo` artifacts except for evidence files.
- Root workspace: Bun workspaces, Turbo task orchestration, strict TypeScript, Biome, shared env validation, documented scripts.
- `apps/fe`: latest Next.js App Router frontend with Tailwind, original ChatGPT-like layout, auth screens, chat shell, sidebar history, skill selector, and memory controls.
- `apps/be`: Hono TypeScript backend with `/api/v1` route prefix, Zod boundary validation, OpenAPI/Scalar docs, structured errors, request IDs, CORS, rate limits, auth/session middleware, authorization policies, and health endpoints.
- `packages/shared`: shared branded IDs, API schemas, error envelope, route constants, and test fixtures safe for FE/BE imports.
- `packages/db`: Drizzle schema, migrations, connection helpers using `postgres.js`, Better Auth tables, conversation/message/skill/memory/audit/usage tables, deterministic seeds, and migration tests.
- Auth: Better Auth mounted in Hono, HttpOnly cookie sessions, explicit session middleware, protected API routes, ownership checks, and same-origin proxy from FE to BE.
- Chat/history: create/list/load conversations, append user messages, stream assistant messages, persist completed and failed turns, recover from stream errors.
- LLM skills: CRUD prompt/model presets owned by users, skill selection per conversation, snapshot selected skill prompt into each LLM run.
- Personal memory MVP: opt-in structured memory notes with category/source/confidence metadata, owner-only CRUD, disable/clear-all, and safe injection into prompt context. Defer pgvector/semantic retrieval to a documented post-MVP extension.
- Docker: production-oriented Dockerfiles for FE and BE, `docker-compose.yml` for FE/BE/Postgres, health checks, and a reset workflow; local dev must still work with normal dev servers and only optional Postgres service.
- Verification: TDD where practical; every todo includes unit/integration/E2E/security/a11y/Docker evidence under `.omo/evidence/` and can be run by an agent.
### Must NOT have (guardrails, anti-slop, scope boundaries)
- Prometheus/planner must not implement product code; only a worker executing this plan may edit product files.
- Do not copy ChatGPT/OpenAI logos, brand colors as trademark identity, proprietary wording, or visual assets; build a similar information architecture with original design tokens.
- Do not expose Postgres, Better Auth secrets, session tokens, or LLM provider keys to frontend code.
- Do not let frontend import `packages/db`; FE may import only `packages/shared`, UI-local code, and generated/public API clients.
- Do not build arbitrary code-execution skills, shell tools, browser automation tools, or external side-effect tools in MVP.
- Do not auto-save sensitive memory categories (health, finance, precise location, government IDs, credentials, minors, biometrics, political/religious/sexual orientation) without explicit user action.
- Do not make Docker mandatory for FE/BE local development; only Postgres may be provided by Docker for convenience.
- Do not use bare `fetch` for production LLM/provider calls without timeout/error policy.
- Do not use `any`, `as any`, non-null assertions, `@ts-ignore`, default exports except Next.js framework-required files, or source files above 250 pure LOC without splitting.
- Do not commit, push, or initialize remote git unless the user explicitly asks.

## Verification strategy
> Zero human intervention - all verification is agent-executed.
- Test decision: TDD for domain/API/database behavior; tests-after only for generated framework scaffolding that cannot fail before files exist.
- Frameworks/tools: Bun test for packages/backend unit tests; Hono app integration tests with real/fake HTTP requests; Drizzle migrations against isolated Postgres; Playwright for FE E2E; axe via Playwright for accessibility; Docker Compose smoke scripts; Biome and `tsc --noEmit` for static checks.
- Blocking gates per todo: `bun run check`, relevant test command for changed scope, and a concrete evidence log in `.omo/evidence/task-<N>-yummy-chat-monorepo.<ext>`.
- Required cross-cutting QA scenarios: auth happy path; auth cross-user isolation; streaming incremental chunks; Docker Compose health/auth; memory privacy/delete/disable; migration idempotency.
- No human-only assertions: visual QA must use Playwright screenshots/traces plus machine assertions; “manual QA” in the final wave means agent-driven real browser usage.

## Execution strategy
### Parallel execution waves
> Target 5-8 todos per wave. Fewer than 3 (except the final) means you under-split.
- Wave 1 (foundation/design/contracts): todos 1-6. Mostly parallel after todo 1; establishes workspace, design system, shared contracts, database skeleton, backend skeleton, frontend skeleton.
- Wave 2 (auth/data/authorization): todos 7-12. Builds auth and protected data access; must prove cookie behavior in dev and Compose before chat work depends on sessions.
- Wave 3 (chat/history/streaming): todos 13-18. Builds deterministic fake-provider chat loop, streaming persistence, FE chat shell, and history.
- Wave 4 (skills/memory/privacy): todos 19-23. Adds user-owned skills and structured memory with privacy controls.
- Wave 5 (Docker/verification/hardening): todos 24-28. Completes Docker, observability/rate-limit hardening, CI-style checks, a11y/visual QA, and docs.

### Dependency matrix
| Todo | Depends on | Blocks | Can parallelize with |
| --- | --- | --- | --- |
| 1 | none | 2-28 | none |
| 2 | 1 | 16,17,27 | 3,4,5,6 |
| 3 | 1 | 4,7,8,13,19,21 | 2,5,6 |
| 4 | 1,3 | 7-23 | 2,5,6 |
| 5 | 1,3 | 7-15,19-22 | 2,4,6 |
| 6 | 1,2,3 | 16-18,23,27 | 4,5 |
| 7 | 4,5 | 8-12,24 | none |
| 8 | 5,7 | 9-18,24 | none |
| 9 | 4,5,7,8 | 10-18,21-22 | none |
| 10 | 3,5,7,8,9 | 11-18 | none |
| 11 | 8,9,10 | 12-18,24 | none |
| 12 | 7-11 | 13-23 | none |
| 13 | 3,4,5,12 | 14-18 | 15 |
| 14 | 13 | 16-18,19 | 15 |
| 15 | 5,12,13 | 16,18 | 14 |
| 16 | 2,6,14,15 | 17,18,27 | none |
| 17 | 14,16 | 18,27 | none |
| 18 | 13-17 | 19-23,28 | none |
| 19 | 3,4,5,18 | 20,23 | 21 |
| 20 | 19 | 23,27 | 21,22 |
| 21 | 3,4,5,18 | 22,23 | 19,20 |
| 22 | 21 | 23,27 | 20 |
| 23 | 19-22 | 28 | none |
| 24 | 7,11,18 | 25,28 | 26,27 |
| 25 | 24 | 28 | 26,27 |
| 26 | 18,23 | 28 | 24,25,27 |
| 27 | 16,17,20,22 | 28 | 24,25,26 |
| 28 | 1-27 | final verification | none |

## Todos
> Implementation + Test = ONE todo. Never separate.
<!-- APPEND TASK BATCHES BELOW THIS LINE WITH edit/apply_patch - never rewrite the headers above. -->
- [x] 1. Root workspace: Create Bun/Turbo monorepo foundation to make every later package buildable - expect `bun run check` to fail only for intentionally absent app files before scaffolds exist
  What to do / Must NOT do: Create root `package.json`, `bunfig.toml` if needed, `turbo.json`, `tsconfig.base.json`, `biome.jsonc`, `.gitignore`, `.env.example`, `README.md`, and `scripts/check-env.ts`. Pin `packageManager` to Bun, `engines` to Bun >= 1.2 and Node >= 20. Do not use npm/yarn lockfiles. Do not initialize git unless user asks.
  Parallelization: Wave 1 | Blocked by: none | Blocks: all todos
  References (executor has NO interview context - be exhaustive): `.omo/drafts/yummy-chat-monorepo.md:22-60` for approved defaults and decisions; TypeScript strict rules summarized in `.omo/drafts/yummy-chat-monorepo.md:49`; Next.js/Turbo runtime findings summarized in `.omo/drafts/yummy-chat-monorepo.md:42`; engine-pin decision in `.omo/drafts/yummy-chat-monorepo.md:55-56`.
  Acceptance criteria (agent-executable): `bun --version`, `bun install --frozen-lockfile`, `bun run check-env`, and `bun run check` all run; `package.json` contains workspaces for `apps/*` and `packages/*`; no `package-lock.json`/`yarn.lock` exists.
  QA scenarios (name the exact tool + invocation): happy: `bun run check-env > .omo/evidence/task-1-yummy-chat-monorepo.log`; failure: temporarily run `BUN_VERSION_OVERRIDE=0.0.0 bun run check-env` or equivalent version-check unit to prove wrong runtime exits nonzero, append output to same evidence file.
  Commit: N | if later requested: `chore(workspace): scaffold bun turbo monorepo foundation`

- [x] 2. Root DESIGN.md: Define original ChatGPT-like design system to prevent UI slop - expect frontend tokens available before components
  What to do / Must NOT do: Create root `DESIGN.md` with atmosphere, palette, typography, spacing, components-to-build, motion, and surface strategy. Choose original neutral command-center styling inspired by ChatGPT information architecture, not OpenAI branding. Ban emojis as icons; specify SVG icon set. Do not write UI components before this exists.
  Parallelization: Wave 1 | Blocked by: 1 | Blocks: 16,17,27
  References: `.omo/drafts/yummy-chat-monorepo.md:48-60` for frontend design-system and UI guardrail findings; frontend skill loaded in planning requires `DESIGN.md` before UI and a 7-section design system; this plan Scope lines 34-44 define branding and no-emoji guardrails.
  Acceptance criteria: `DESIGN.md` has all 7 mandatory sections; a script or grep confirms no TODO placeholders remain; token names for color/type/spacing are present and referenced by future Tailwind config.
  QA scenarios: happy: `bun run docs:check-design > .omo/evidence/task-2-yummy-chat-monorepo.log` (create this script if absent); failure: inject a temporary placeholder into a copy of DESIGN.md and prove the checker fails, append to evidence.
  Commit: N | if later requested: `docs(design): add chat product design system`

- [x] 3. Shared contracts: Add branded IDs, API schemas, route constants, and error envelope to prevent FE/BE drift - expect shared package to typecheck alone
  What to do / Must NOT do: Create `packages/shared` with Zod schemas and readonly/branded types for `UserId`, `ConversationId`, `MessageId`, `SkillId`, `MemoryId`, `SessionId`, API route constants under `/api/v1`, `YummyError` discriminated union, and a response envelope. Use named exports only. Do not include database client code or secrets.
  Parallelization: Wave 1 | Blocked by: 1 | Blocks: 4,7,8,13,19,21
  References: `.omo/drafts/yummy-chat-monorepo.md:26-38` for layout/defaults; `.omo/drafts/yummy-chat-monorepo.md:49,55-56` for strict TypeScript, `/api/v1`, and shared error-envelope decisions.
  Acceptance criteria: `bun --filter @yummy/shared test`, `bun --filter @yummy/shared typecheck`, and a no-excuse audit pass; tests cover valid and invalid schema parses plus exhaustive error switch.
  QA scenarios: happy: `bun --filter @yummy/shared test && bun --filter @yummy/shared typecheck > .omo/evidence/task-3-yummy-chat-monorepo.log`; failure: `bun --filter @yummy/shared test -- invalid-contracts.test.ts` includes invalid UUID/email/message payloads and asserts Zod failures plus exact error envelope shape.
  Commit: N | if later requested: `feat(shared): add api contracts and typed errors`

- [x] 4. Database package: Add Drizzle/Postgres schema and migrations to persist auth, chat, skills, memory, usage, and audit records - expect clean and repeated migrations pass
  What to do / Must NOT do: Create `packages/db` with Drizzle config, `postgres.js` connection, schema tables for Better Auth-compatible users/sessions/accounts/verifications (or generated Better Auth schema adapted cleanly), conversations, messages, skills, conversation skill snapshots, memory records, audit events, and usage records. Use Postgres 16-compatible SQL. Do not add pgvector to MVP migrations; add a documented post-MVP migration stub only.
  Parallelization: Wave 1 | Blocked by: 1,3 | Blocks: 7-23
  References: `.omo/drafts/yummy-chat-monorepo.md:31-34,45-47,55-58` for DB responsibilities, Drizzle/Postgres findings, `postgres.js`, Postgres pinning, and pgvector deferral; Better Auth Drizzle adapter finding in `.omo/drafts/yummy-chat-monorepo.md:46`.
  Acceptance criteria: `bun --filter @yummy/db db:generate`, `bun --filter @yummy/db db:migrate:test`, and `bun --filter @yummy/db test:migrations` pass against isolated Postgres; migration idempotency test proves second migrate is no-op.
  QA scenarios: happy: `docker compose -f docker-compose.test.yml up -d postgres && bun --filter @yummy/db db:migrate:test > .omo/evidence/task-4-yummy-chat-monorepo.log`; failure: tests attempt duplicate user email and cross-table orphan message insert and assert DB rejects them.
  Commit: N | if later requested: `feat(db): add drizzle postgres schema and migrations`

- [x] 5. Hono API skeleton: Scaffold backend with versioned routes, middleware, OpenAPI/Scalar, request IDs, errors, CORS, rate limits, and health checks - expect API docs and health endpoints work
  What to do / Must NOT do: Create `apps/be` using Hono on Bun. Add `/api/v1` base router, structured logger, request ID middleware (`X-Request-Id`), CORS for exact FE origins, secure headers, typed error handler using shared envelope, OpenAPI/Scalar docs, health/live/ready routes, and explicit rate-limit defaults (auth 5/min/IP, chat 30/min/user or stricter test-friendly config). Do not mount unversioned product routes.
  Parallelization: Wave 1 | Blocked by: 1,3 | Blocks: 7-15,19-22
  References: `.omo/drafts/yummy-chat-monorepo.md:43-46,55-56` for Hono middleware/CORS/streaming/OpenAPI findings and `/api/v1`/request-ID/rate-limit decisions.
  Acceptance criteria: `bun --filter @yummy/be dev:test-health`, `bun --filter @yummy/be test:api`, and `curl http://localhost:3001/api/v1/health` returns 200 with request ID header; `/scalar` or `/api/docs` loads docs.
  QA scenarios: happy: `bun --filter @yummy/be test:api && curl -i http://localhost:3001/api/v1/health > .omo/evidence/task-5-yummy-chat-monorepo.log`; failure: `bun --filter @yummy/be test:api -- error-envelope.test.ts` sends malformed JSON and unsupported content type, asserting shared error envelope with non-2xx status and request ID.
  Commit: N | if later requested: `feat(api): scaffold hono service with middleware and docs`

- [x] 6. Next.js frontend skeleton: Scaffold app shell with single-origin API proxy and dev-only React tooling gate - expect FE can call BE through `/api/v1/*`
  What to do / Must NOT do: Create `apps/fe` with latest Next.js App Router, Tailwind wired to `DESIGN.md`, `next.config.ts` rewrites/proxy from `/api/v1/:path*` to BE in dev and Docker, `output: "standalone"`, `outputFileTracingRoot` for monorepo, environment validation, base routes for login/chat/settings. Install only necessary dev tooling first; if react-scan is added, gate it to development. Do not allow FE to import `packages/db`.
  Parallelization: Wave 1 | Blocked by: 1,2,3 | Blocks: 16-18,23,24,27
  References: `.omo/drafts/yummy-chat-monorepo.md:42,48,54-55` for Next App Router/Tailwind/standalone/env findings, frontend QA constraints, and same-origin proxy decision; Scope lines 34-44 for frontend guardrails.
  Acceptance criteria: `bun --filter @yummy/fe typecheck`, `bun --filter @yummy/fe lint`, and a smoke route load pass; a dependency boundary check fails if FE imports `@yummy/db`.
  QA scenarios: happy: `bun --filter @yummy/fe test:smoke > .omo/evidence/task-6-yummy-chat-monorepo.log`; failure: run boundary test with a fixture import of `@yummy/db` and assert it fails.
  Commit: N | if later requested: `feat(fe): scaffold next app with api proxy`

- [x] 7. Better Auth database integration: Wire Better Auth to Drizzle/Postgres to create sessions safely - expect sign-up/sign-in/session works through backend
  What to do / Must NOT do: Add Better Auth config in BE, Drizzle adapter, auth table mapping, secret/env validation, auth handler mounted under `/api/v1/auth/*`, and tests for sign-up, duplicate email, sign-in, session lookup, logout/revocation. Do not hand-roll password hashing/session cookies outside Better Auth.
  Parallelization: Wave 2 | Blocked by: 4,5 | Blocks: 8-12,24
  References: `.omo/drafts/yummy-chat-monorepo.md:30,46,54-56` for Better Auth Hono/Drizzle findings, HttpOnly SameSite=Lax cookie default, and first-auth-validation decisions.
  Acceptance criteria: `bun --filter @yummy/be test:auth` passes; auth routes set HttpOnly SameSite=Lax cookies in dev; invalid credentials never create sessions.
  QA scenarios: happy: `bun --filter @yummy/be test:auth -- auth-happy.test.ts > .omo/evidence/task-7-yummy-chat-monorepo.log`; failure: `bun --filter @yummy/be test:auth -- auth-failure.test.ts` covers duplicate email and wrong password, asserting shared errors and no session row.
  Commit: N | if later requested: `feat(auth): integrate better auth with postgres`

- [x] 8. Auth session middleware and FE single-origin auth flow: Make cookie auth work identically in dev and Docker - expect no cross-origin cookie bug
  What to do / Must NOT do: Add Hono session middleware that sets `user`/`session` context, frontend auth client helpers that call same-origin `/api/v1/auth/*`, login/register/logout pages, protected chat route handling, and proxy-aware cookie behavior. Do not call BE service hostname from browser code.
  Parallelization: Wave 2 | Blocked by: 5,7 | Blocks: 9-18,24
  References: `.omo/drafts/yummy-chat-monorepo.md:46,54-55` for Better Auth Hono middleware/CORS findings and same-origin proxy decision; this plan Scope lines 28 and 37-38 for auth/session and FE boundary guardrails.
  Acceptance criteria: Playwright auth flow passes against dev servers; a Compose auth smoke script also passes after todo 24; FE browser requests use `/api/v1/*` relative paths only.
  QA scenarios: happy: `bun run test:e2e -- auth.spec.ts > .omo/evidence/task-8-yummy-chat-monorepo.log`; failure: protected `/chat` without session redirects to login and direct cross-origin BE URL is absent from built browser bundle.
  Commit: N | if later requested: `feat(auth): add single origin session flow`

- [x] 9. Authorization policies and scoped repositories: Enforce owner-only access to conversations, skills, memories, and audit-safe resources - expect cross-user leaks fail
  What to do / Must NOT do: Add backend policy functions (`canReadConversation`, `canWriteConversation`, `canManageSkill`, `canManageMemory`) and repository helpers that require `actor.userId`. Scope every private DB query by owner. Do not use frontend role checks as authorization.
  Parallelization: Wave 2 | Blocked by: 4,5,7,8 | Blocks: 10-18,21-22
  References: `.omo/drafts/yummy-chat-monorepo.md:31,49,55-56,73-82` for authorization default, strict/branded TypeScript, scoped query decisions, and scope-out guardrails.
  Acceptance criteria: `bun --filter @yummy/be test:authz` proves user B cannot list/read/write/delete user A resources; no repository method accepts raw unbranded string IDs.
  QA scenarios: happy: `bun --filter @yummy/be test:authz -- owner-access.test.ts > .omo/evidence/task-9-yummy-chat-monorepo.log` verifies user A reads own conversation/skill/memory; failure: `bun --filter @yummy/be test:authz -- cross-user-deny.test.ts` verifies user B receives 404/403 without data leakage.
  Commit: N | if later requested: `feat(authz): add ownership policies`

- [x] 10. API contract tests and generated/public client helpers: Lock FE/BE request/response compatibility - expect frontend uses typed public contracts only
  What to do / Must NOT do: Add contract tests for every current `/api/v1` route, shared client helpers in `packages/shared` or `apps/fe/src/lib/api`, and response parsing through Zod. Do not parse arbitrary JSON shapes in UI components.
  Parallelization: Wave 2 | Blocked by: 3,5,7,8,9 | Blocks: 11-18
  References: `.omo/drafts/yummy-chat-monorepo.md:43,49,55-56` for Hono/OpenAPI findings, Zod boundary rule, `/api/v1`, and shared error-envelope decisions.
  Acceptance criteria: contract test command validates OpenAPI/schema output and FE client parse behavior; any route returning non-envelope error fails tests.
  QA scenarios: happy: `bun run test:contracts > .omo/evidence/task-10-yummy-chat-monorepo.log`; failure: fixture route with wrong status/body shape is rejected by contract test.
  Commit: N | if later requested: `test(api): add shared contract coverage`

- [x] 11. Seed data and deterministic test identities: Add reproducible dev/test users without leaking secrets - expect E2E can bootstrap consistently
  What to do / Must NOT do: Add `db:seed:dev` and `db:seed:test` with deterministic users, skills, conversations, and memories using safe local-only passwords. Ensure seeds are idempotent and cannot run in production. Do not commit real credentials or API keys.
  Parallelization: Wave 2 | Blocked by: 8,9,10 | Blocks: 12-18,24
  References: `.omo/drafts/yummy-chat-monorepo.md:45-46,49,59-60,73-82` for Drizzle/Better Auth findings, strict testing requirement, evidence requirement, and no-secret guardrails.
  Acceptance criteria: `APP_ENV=test bun --filter @yummy/db db:seed:test` runs twice successfully and creates known fixtures; production env seed attempt exits nonzero.
  QA scenarios: happy: `APP_ENV=test bun --filter @yummy/db db:seed:test > .omo/evidence/task-11-yummy-chat-monorepo.log` twice proves idempotency; failure: `APP_ENV=production bun --filter @yummy/db db:seed:test` exits nonzero and appends its refusal to the same evidence file.
  Commit: N | if later requested: `chore(db): add deterministic seed workflows`

- [x] 12. Authenticated API smoke gate: Prove sign-in plus protected API access before chat work - expect release-blocking auth baseline
  What to do / Must NOT do: Add a smoke script that starts BE against test DB, signs up/signs in, stores cookies, calls `/api/v1/auth/session`, calls one protected placeholder route, and verifies logout revokes session. Do not proceed to chat until this passes.
  Parallelization: Wave 2 | Blocked by: 7-11 | Blocks: 13-23
  References: `.omo/drafts/yummy-chat-monorepo.md:46,54-60` for Better Auth findings, same-origin cookie-risk mitigation, and agent-executable evidence decision; Verification strategy lines 46-52.
  Acceptance criteria: `bun run smoke:auth` exits 0 and writes response headers/statuses; invalid cookie scenario exits nonzero in test mode.
  QA scenarios: happy: `bun run smoke:auth > .omo/evidence/task-12-yummy-chat-monorepo.log`; failure: `bun run smoke:auth -- --invalid-cookie` exits nonzero and appends the invalid-session rejection.
  Commit: N | if later requested: `test(auth): add authenticated api smoke gate`

- [x] 13. Conversation and message API: Add chat history CRUD to persist user-owned conversations - expect users can create/list/read own history only
  What to do / Must NOT do: Add Hono routes for create/list/get/update title/archive conversation and append/list messages, with pagination and owner scoping. Use shared schemas and typed repositories. Do not allow client-supplied `userId` to determine ownership.
  Parallelization: Wave 3 | Blocked by: 3,4,5,12 | Blocks: 14-18
  References: user requirement chat/history; `.omo/drafts/yummy-chat-monorepo.md:72`; authorization policies todo 9; Drizzle schema todo 4.
  Acceptance criteria: `bun --filter @yummy/be test:conversations` covers create/list/read/update/archive and validation failures.
  QA scenarios: happy: `bun --filter @yummy/be test:conversations -- conversation-happy.test.ts > .omo/evidence/task-13-yummy-chat-monorepo.log` creates two conversations and lists them; failure: `bun --filter @yummy/be test:conversations -- conversation-failure.test.ts` rejects empty title, oversized pagination, and cross-user get.
  Commit: N | if later requested: `feat(chat): add conversation history api`

- [x] 14. Deterministic fake LLM streaming service: Build streaming backend with abort/error handling before real provider - expect incremental chunks are observable
  What to do / Must NOT do: Add LLM provider interface, fake provider emitting deterministic delayed chunks, Hono `/api/v1/chat/stream` route using AI SDK UI message stream or compatible protocol, abort propagation, final marker, and failed-run persistence policy. Do not use a real API key in tests.
  Parallelization: Wave 3 | Blocked by: 13 | Blocks: 16-19
  References: `.omo/drafts/yummy-chat-monorepo.md:43-44,57,59-60` for Hono/AI SDK streaming findings, fake-provider decision, and evidence requirements.
  Acceptance criteria: streaming integration test observes at least 3 chunks before final completion with timestamps proving non-buffered delivery; abort test proves upstream fake stops.
  QA scenarios: happy: `bun --filter @yummy/be test:streaming > .omo/evidence/task-14-yummy-chat-monorepo.log`; failure: fake provider error emits structured stream error and leaves message marked failed/incomplete.
  Commit: N | if later requested: `feat(chat): add deterministic streaming provider`

- [x] 15. Chat orchestration service: Assemble prompt context from history, selected skill, and memory stubs - expect provider calls are safe and typed
  What to do / Must NOT do: Add orchestration layer that validates request, loads actor-owned conversation, selects recent history under token/message budget, includes selected skill snapshot if present, includes memory context only if enabled, calls provider with timeout/abort, records usage metadata, and returns stream. Do not put secrets or raw privileged data into prompts.
  Parallelization: Wave 3 | Blocked by: 5,12,13 | Blocks: 16,18
  References: `.omo/drafts/yummy-chat-monorepo.md:32-34,49,56-58` for LLM SDK/skills/memory defaults, strict typed errors, rate-limit/request-ID decisions, and fake-provider/memory privacy decisions.
  Acceptance criteria: unit tests cover prompt assembly variants: no skill, selected skill, memory disabled, token budget truncation, provider timeout.
  QA scenarios: happy: `bun --filter @yummy/be test:llm -- prompt-assembly-happy.test.ts > .omo/evidence/task-15-yummy-chat-monorepo.log`; failure: `bun --filter @yummy/be test:llm -- prompt-injection-boundary.test.ts` includes malicious user content and asserts it is marked as untrusted in prompt context.
  Commit: N | if later requested: `feat(llm): add chat orchestration service`

- [x] 16. Chat UI client island: Build responsive transcript/composer streaming UI - expect visible incremental response and accessible controls
  What to do / Must NOT do: Build `apps/fe` chat route as RSC shell for auth/layout and client components for composer, transcript, stream status, stop/retry, and optimistic user message. Use `@ai-sdk/react` or custom fetch stream through same-origin `/api/v1`. Follow `DESIGN.md`. Do not make the whole app `use client`; isolate client islands.
  Parallelization: Wave 3 | Blocked by: 2,6,14,15 | Blocks: 17,18,27
  References: `.omo/drafts/yummy-chat-monorepo.md:28,42,48,54-55` for Next App Router/RSC, AI SDK frontend compatibility, frontend design constraints, and same-origin proxy decision.
  Acceptance criteria: Playwright test sends a message and sees assistant text append in chunks; keyboard can focus composer and send; no horizontal overflow at 375px.
  QA scenarios: happy: `bun --filter @yummy/fe test:e2e -- chat-stream.spec.ts > .omo/evidence/task-16-yummy-chat-monorepo.log`; failure: fake provider error shows actionable retry and clears loading state.
  Commit: N | if later requested: `feat(fe): add streaming chat interface`

- [x] 17. History sidebar and conversation navigation: Build persisted conversation browser - expect reload restores history
  What to do / Must NOT do: Add sidebar/list UI, new chat button, conversation switcher, archived/empty/loading/error states, mobile drawer behavior, and API hooks using shared contracts. Do not rely on local-only state for persisted history.
  Parallelization: Wave 3 | Blocked by: 14,16 | Blocks: 18,27
  References: user requirement history; DESIGN.md from todo 2; conversation API todo 13; Verification strategy lines 46-52 for E2E evidence requirements.
  Acceptance criteria: Playwright creates two conversations, reloads, switches between them, and verifies messages do not bleed across chats.
  QA scenarios: happy: `bun --filter @yummy/fe test:e2e -- history-sidebar.spec.ts > .omo/evidence/task-17-yummy-chat-monorepo.log`; failure: `bun --filter @yummy/fe test:e2e -- history-error-states.spec.ts` covers unauthorized/deleted conversation navigation.
  Commit: N | if later requested: `feat(fe): add conversation history sidebar`

- [x] 18. End-to-end core stop gate: Prove auth + chat + history works before advanced features - expect first complete product loop
  What to do / Must NOT do: Add a release-blocking E2E script that starts test DB, BE, FE, seeds user, logs in, starts conversation, streams fake assistant response, reloads, verifies history, logs out, and confirms protected redirect. Do not continue to skills/memory until this gate passes.
  Parallelization: Wave 3 | Blocked by: 13-17 | Blocks: 19-23,28
  References: `.omo/drafts/yummy-chat-monorepo.md:62-71` for Scope IN and required core auth/chat/history features; Verification strategy lines 46-52 for E2E and evidence requirements.
  Acceptance criteria: `bun run smoke:core` exits 0 and captures Playwright trace on failure.
  QA scenarios: happy: `bun run smoke:core > .omo/evidence/task-18-yummy-chat-monorepo.log`; failure: `bun run smoke:core -- --provider-error` captures Playwright trace for provider failure and verifies recovery state.
  Commit: N | if later requested: `test(e2e): add core auth chat history smoke`

- [x] 19. Skills backend: Add user-owned LLM skill CRUD and conversation skill selection - expect selected skill snapshots are auditable
  What to do / Must NOT do: Add API routes and repositories for create/list/update/delete skills, select skill for conversation, and snapshot skill prompt/model/settings into LLM run metadata. Skills are prompt/model presets only. Do not implement arbitrary tool execution or external side effects.
  Parallelization: Wave 4 | Blocked by: 3,4,5,18 | Blocks: 20,23
  References: user requirement “add skills for LLMs”; `.omo/drafts/yummy-chat-monorepo.md:32-33,57-58,67-68` for skill defaults, fake-provider/memory decisions, and scope; todo 9 authorization policy.
  Acceptance criteria: API tests cover skill CRUD, ownership isolation, selected skill prompt included in prompt assembly, deleted skill does not mutate historical snapshots.
  QA scenarios: happy: `bun --filter @yummy/be test:skills -- skills-happy.test.ts > .omo/evidence/task-19-yummy-chat-monorepo.log`; failure: `bun --filter @yummy/be test:skills -- skills-authz.test.ts` includes user B trying to select user A skill.
  Commit: N | if later requested: `feat(skills): add llm prompt presets`

- [x] 20. Skills UI: Add skill manager and selector in chat - expect users can create and use a skill without leaving chat flow
  What to do / Must NOT do: Build skill settings page/modal and chat selector with empty/loading/error states, validation messages, and accessible controls. Do not expose raw system prompt internals beyond user-owned skill instructions.
  Parallelization: Wave 4 | Blocked by: 19 | Blocks: 23,27
  References: DESIGN.md from todo 2; skills backend todo 19; Verification strategy lines 46-52 for UI state and E2E evidence requirements.
  Acceptance criteria: Playwright creates a skill, selects it for a conversation, sends a message, and backend metadata shows skill snapshot was used.
  QA scenarios: happy: `bun --filter @yummy/fe test:e2e -- skills-ui.spec.ts > .omo/evidence/task-20-yummy-chat-monorepo.log`; failure: `bun --filter @yummy/fe test:e2e -- skills-ui-errors.spec.ts` covers invalid empty skill prompt and deleted skill selection.
  Commit: N | if later requested: `feat(fe): add skill management ui`

- [x] 21. Structured memory backend: Add opt-in memory CRUD, disable/clear, prompt injection rules, and privacy filters - expect owner-only memory behavior
  What to do / Must NOT do: Add memory records with category/source/confidence/user visibility, user memory settings, CRUD routes, disable/clear-all routes, simple recency/keyword retrieval, and orchestration integration only when memory is enabled. Defer pgvector/embedding provider to post-MVP docs. Do not auto-save sensitive categories without explicit action.
  Parallelization: Wave 4 | Blocked by: 3,4,5,18 | Blocks: 22,23
  References: user requirement personal memory; `.omo/drafts/yummy-chat-monorepo.md:34,47,57-58,68` for structured memory default, pgvector deferral, privacy controls, and scope.
  Acceptance criteria: tests cover create/read/update/delete/disable/clear, owner isolation, disabled memory not injected into prompt, sensitive category rejection unless explicit flag.
  QA scenarios: happy: `bun --filter @yummy/be test:memory -- memory-happy.test.ts > .omo/evidence/task-21-yummy-chat-monorepo.log`; failure: `bun --filter @yummy/be test:memory -- memory-privacy.test.ts` includes cross-user memory fetch and disabled-memory injection attempt.
  Commit: N | if later requested: `feat(memory): add structured personal memory`

- [x] 22. Memory UI: Add view/edit/delete/disable controls - expect users can control personal memory visibly
  What to do / Must NOT do: Build memory settings page/panel with opt-in toggle, list/edit/delete/clear-all, disabled state, and explanation of what memory does. Do not hide delete/disable behind obscure menus.
  Parallelization: Wave 4 | Blocked by: 21 | Blocks: 23,27
  References: DESIGN.md from todo 2; `.omo/drafts/yummy-chat-monorepo.md:34,57-58,79-81` for memory privacy defaults; Verification strategy lines 46-52 for accessibility evidence requirements.
  Acceptance criteria: Playwright verifies opt-in, create memory, delete memory, disable memory, and no memory appears in later prompt metadata.
  QA scenarios: happy: `bun --filter @yummy/fe test:e2e -- memory-ui.spec.ts > .omo/evidence/task-22-yummy-chat-monorepo.log`; failure: `bun --filter @yummy/fe test:e2e -- memory-ui-errors.spec.ts` covers deletion rollback/error state.
  Commit: N | if later requested: `feat(fe): add memory controls ui`

- [x] 23. Advanced-feature E2E gate: Prove skills and memory integrate with chat safely - expect no privacy leaks
  What to do / Must NOT do: Add E2E flow that logs in, creates skill, creates memory, starts chat with selected skill and memory enabled, verifies metadata/context usage, disables memory, sends another chat, verifies memory absent, and confirms cross-user isolation. Do not require real LLM provider.
  Parallelization: Wave 4 | Blocked by: 19-22 | Blocks: 28
  References: user core features skills/memory; `.omo/drafts/yummy-chat-monorepo.md:32-34,57-58,79-81` for skills/memory defaults and privacy guardrails.
  Acceptance criteria: `bun run smoke:advanced` exits 0 with fake provider; trace retained on failure.
  QA scenarios: happy: `bun run smoke:advanced > .omo/evidence/task-23-yummy-chat-monorepo.log`; failure: `bun run smoke:advanced -- --cross-user-memory` verifies no cross-user skill or memory leakage.
  Commit: N | if later requested: `test(e2e): add skills and memory smoke`

- [x] 24. Docker Compose and production builds: Containerize FE/BE/Postgres without breaking auth cookies - expect Compose stack passes auth + health smoke
  What to do / Must NOT do: Add FE Dockerfile using Next standalone output and monorepo tracing, BE Dockerfile using Bun production runtime, `.dockerignore`, `docker-compose.yml` with `fe`, `be`, `postgres` pinned to Postgres 16 image (plain Postgres for MVP), health checks, env wiring, and same-origin FE proxy. Do not use service hostnames in browser-visible API URLs.
  Parallelization: Wave 5 | Blocked by: 7,11,18 | Blocks: 25,28
  References: user Docker Compose requirement; `.omo/drafts/yummy-chat-monorepo.md:35,42,54-59,69-70` for Docker/local-dev defaults, Next standalone finding, same-origin proxy, Postgres pinning, and local dev scope.
  Acceptance criteria: `docker compose build`, `docker compose up -d`, `docker compose ps` all healthy; Compose auth smoke signs in through FE origin and calls protected API.
  QA scenarios: happy: `docker compose build && docker compose up -d && bun run smoke:compose-auth > .omo/evidence/task-24-yummy-chat-monorepo.log`; failure: `bun run smoke:compose-auth -- --inspect-browser-bundle` asserts wrong direct BE browser URL is not used and unauthenticated protected route redirects.
  Commit: N | if later requested: `chore(docker): add compose stack for fe be postgres`

- [x] 25. Local dev and reset workflows: Document and script non-Docker FE/BE dev plus repeatable DB reset - expect fresh clone instructions work
  What to do / Must NOT do: Add root scripts for `dev`, `dev:db`, `db:migrate`, `db:seed`, `db:reset`, `smoke:local`, and update README with exact steps. Local FE/BE run via dev servers; Docker is optional for Postgres convenience. Do not require Docker Compose for all app dev.
  Parallelization: Wave 5 | Blocked by: 24 | Blocks: 28
  References: user local dev requirement; `.omo/drafts/yummy-chat-monorepo.md:35,59,69-70,80` for Docker/local-dev defaults, non-Docker FE/BE dev decision, and no Docker-only guardrail.
  Acceptance criteria: From clean checkout dependencies, `bun install`, `bun run dev:db`, `bun run db:migrate`, `bun run dev` starts FE and BE; `bun run smoke:local` passes.
  QA scenarios: happy: `bun run smoke:local > .omo/evidence/task-25-yummy-chat-monorepo.log`; failure: `env -u DATABASE_URL bun run smoke:local` exits nonzero with clear missing-env error appended.
  Commit: N | if later requested: `docs(dev): add local workflow and reset scripts`

- [x] 26. Security and observability hardening: Add audit logs, token usage, redaction, and rate-limit evidence - expect sensitive operations are traceable without logging secrets
  What to do / Must NOT do: Add structured audit events for login/logout/auth failures/authorization failures/chat runs/skill changes/memory changes/rate-limit violations; request IDs in logs; token/usage records for fake/real provider calls; redaction utility for secrets/PII; tests for rate limits. Do not log raw passwords, session tokens, API keys, full prompts by default, or full LLM responses by default.
  Parallelization: Wave 5 | Blocked by: 18,23 | Blocks: 28
  References: `.omo/drafts/yummy-chat-monorepo.md:49,55-60,73-82` for strict typed errors, request IDs/rate limits, evidence requirements, and security/privacy scope-out guardrails.
  Acceptance criteria: `bun run test:security` covers cookie attributes, rate limits, redaction, audit event insertion, authz failures; logs include request IDs.
  QA scenarios: happy: `bun run test:security > .omo/evidence/task-26-yummy-chat-monorepo.log`; failure: `bun run test:security -- redaction-negative.test.ts` verifies raw secret strings are redacted in logs.
  Commit: N | if later requested: `feat(security): add audit logging and redaction`

- [x] 27. Accessibility, responsive, and browser visual QA: Verify UI quality in real browser - expect usable mobile/tablet/desktop states
  What to do / Must NOT do: Add Playwright + axe tests for login, empty chat, active streaming, history sidebar, skills UI, memory UI, and error states at 375/768/1280 widths. Capture screenshots/traces. Do not declare visual pass based on code inspection.
  Parallelization: Wave 5 | Blocked by: 16,17,20,22 | Blocks: 28
  References: `.omo/drafts/yummy-chat-monorepo.md:48-49,59-60` for real-browser visual QA and strict verification findings; Verification strategy lines 46-52 for a11y/responsive evidence requirements.
  Acceptance criteria: `bun run test:a11y` and `bun run test:visual` pass with no serious/critical axe violations and no mobile horizontal overflow.
  QA scenarios: happy: `bun run test:a11y && bun run test:visual > .omo/evidence/task-27-yummy-chat-monorepo.log`; failure: `bun run test:a11y -- missing-label.fixture.spec.ts` captures screenshot/trace for an injected missing-label fixture or known invalid test page.
  Commit: N | if later requested: `test(fe): add accessibility and visual qa`

- [x] 28. Final project quality gate and handoff docs: Run all checks and document remaining post-MVP work - expect worker can hand off without hidden gaps
  What to do / Must NOT do: Run full static/test/build/Docker/E2E matrix, produce `.omo/evidence/final-yummy-chat-monorepo/` summary, update README with architecture and commands, document post-MVP deferrals (pgvector semantic memory, real OAuth providers, distributed Redis rate limit/session, advanced tools) without implementing them. Do not hide failing tests or mark deferred work as done.
  Parallelization: Wave 5 | Blocked by: 1-27 | Blocks: final verification
  References: full plan Scope/Verification/Success sections; `.omo/drafts/yummy-chat-monorepo.md:57-60,84-90` for post-MVP deferral/evidence decisions and approved action.
  Acceptance criteria: `bun run check`, `bun run test`, `bun run test:e2e`, `bun run test:a11y`, `bun run test:security`, `docker compose build`, `docker compose up -d`, and Compose smoke pass; README contains exact local and Docker commands.
  QA scenarios: happy: `bun run check && bun run test && bun run test:e2e && bun run test:a11y && bun run test:security && docker compose build && docker compose up -d && bun run smoke:compose > .omo/evidence/final-yummy-chat-monorepo/summary.log`; failure: `env -u DATABASE_URL bun run check-env` appends one intentionally invalid env run proving startup validation fails clearly.
  Commit: N | if later requested: `docs(handoff): add final verification summary`

## Final verification wave
> Runs in parallel after ALL todos. ALL must APPROVE. Surface results and wait for the user's explicit okay before declaring complete.
- [x] F1. Plan compliance audit: Read `.omo/plans/yummy-chat-monorepo.md`, inspect changed files, and verify every todo acceptance/evidence path exists. Must reject if any required feature is missing or any Must NOT guardrail is violated. Evidence: `.omo/evidence/final-yummy-chat-monorepo/F1-plan-compliance.md`.
- [x] F2. Code quality review: Run strict TypeScript/Biome/no-excuse audit, file pure-LOC check (<250 unless justified), dependency boundary check (`apps/fe` must not import `packages/db`), and secret scan. Evidence: `.omo/evidence/final-yummy-chat-monorepo/F2-code-quality.md`.
- [x] F3. Real browser QA: Use Playwright to drive login, chat streaming, history, skills, memory, logout, responsive breakpoints, and error states. Capture screenshots/traces. Evidence: `.omo/evidence/final-yummy-chat-monorepo/F3-browser-qa/`.
- [x] F4. Scope fidelity/security audit: Verify stack choices match user requirements (Next.js latest, Hono TS, Docker Compose FE/BE, local dev servers, Postgres) and security/privacy defaults (authz, cookies, memory delete/disable, no secrets in FE/logs). Evidence: `.omo/evidence/final-yummy-chat-monorepo/F4-scope-security.md`.

## Commit strategy
- Default: do not commit because the user did not request git work and the folder is not currently a git repo.
- If the user later explicitly requests commits, initialize git only after confirming, then commit by completed wave with concise messages:
  - `chore(workspace): scaffold monorepo foundation`
  - `feat(auth): add postgres-backed sessions and authorization`
  - `feat(chat): add streaming chat and history`
  - `feat(skills-memory): add skills and personal memory controls`
  - `chore(infra): add docker and verification workflows`
- Never commit secrets, `.env`, local database volumes, Playwright videos except intentional evidence artifacts under `.omo/evidence/`, or generated build output.

## Success criteria
- Fresh dependency install succeeds with Bun and pinned engines.
- FE runs under `apps/fe` with Next.js latest App Router and BE runs under `apps/be` with Hono TypeScript.
- Authenticated user can sign up/sign in, access protected chat, log out, and is redirected when unauthenticated.
- User can create conversations, send messages, receive incremental streamed assistant replies from fake provider, reload, and see persisted history.
- User can create/select LLM skills and selected skill snapshots are used in chat runs.
- User can opt in to memory, create/edit/delete/disable memory, and disabled/deleted memory is not injected into future chats.
- User A cannot access user B conversations, messages, skills, memories, or audit-sensitive data.
- Docker Compose starts FE, BE, and Postgres and passes health/auth/chat smoke tests.
- Local dev works through dev servers without Dockerizing FE/BE.
- Static checks, unit tests, integration tests, migration tests, streaming tests, E2E, a11y, security, and Docker smoke checks pass with evidence under `.omo/evidence/`.
- No Must NOT guardrails are violated, especially no copied branding, no frontend secrets, no frontend DB imports, no arbitrary tool/code-execution skills, and no sensitive memory auto-save.
