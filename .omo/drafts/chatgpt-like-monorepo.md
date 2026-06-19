# chatgpt-like-monorepo draft

status: awaiting-approval
pending_action: write `.omo/plans/chatgpt-like-monorepo.md` with scaffold script, then run Metis + automatic dual-Momus high-accuracy review because this was routed as UNCLEAR/open-ended architecture work
request: Build a ChatGPT-like chat UI in the `yummy-chat` folder as a monorepo with FE and BE under it; FE Next.js latest; BE Hono TypeScript; Docker Compose for FE/BE; local dev via dev servers; core features chat, history, LLM skills, personal memory, authorization/authentication; Postgres DB.
routing: UNCLEAR/open-ended greenfield architecture. Do not ask interview questions; adopt best-practice defaults and surface them for veto at approval gate.
classification: Architecture/bootstrap.

## Grounding evidence

- Repo surface: `/Users/vylhc/Documents/VPBank/codebase/yummy/yummy-chat` is a blank product scaffold: no application source, no package manifests, no Docker files, no tests, no CI, no `README.md`, no `DESIGN.md`, and no `.git/`. Existing `.codegraph`, `.opencode`, and `.omo` are tooling/state only.
- CodeGraph: `.codegraph/codegraph.db` exists but has no relevant application symbols; `codegraph explore "project structure and existing application files"` found no code.
- Frontend docs: Next.js docs resolved to `/vercel/next.js/v16.2.9`; `create-next-app` supports `bun create next-app`, App Router defaults, TypeScript, Tailwind, `output: "standalone"` for Docker, runtime env via App Router dynamic rendering.
- Hono docs: Hono official docs cover JWT middleware, CORS, logger/etag/secure headers, streaming/SSE (`streamSSE`) and middleware ordering. AI SDK Hono cookbook supports `streamText().toUIMessageStreamResponse()` and custom data streaming from Hono.
- DB docs: Drizzle docs support Postgres schema via `pgTable`, migrations with generated SQL, relations, and node-postgres/postgres.js connections.
- Auth docs: Better Auth Hono integration supports mounting `/api/auth/*`, CORS before auth routes, session middleware storing `user`/`session` in Hono context, cross-domain cookie settings, and Drizzle adapter for Postgres.
- Frontend skill constraints: No UI component work before creating project-root `DESIGN.md`; React dev tooling (`react-grab`, `react-scan`, `react-doctor`) should be dev-only; browser QA at 375/768/1280 px is required after UI implementation.
- TypeScript constraints: strict TypeScript, Zod at boundaries, Drizzle for ORM, Hono backend, Biome, no `any`, no unsafe type assertions, TDD, source files should stay under 250 pure LOC.

## Components ledger

1. Monorepo/tooling foundation
   - Responsibilities: root package manager/workspaces, task orchestration, strict TS/Biome, env examples, README, CI-ready scripts.
   - Failure modes: incompatible workspace runtime, missing env validation, impossible fresh clone.
2. Frontend web app (`apps/fe`)
   - Responsibilities: ChatGPT-like responsive shell, auth screens, sidebar history, chat transcript/composer, skill selector, memory management UI.
   - Failure modes: streaming UI stuck, inaccessible composer, stale history, mobile sidebar breakage.
3. Backend API (`apps/be`)
   - Responsibilities: Hono HTTP API, auth/session middleware, route validation, authorization, chat orchestration endpoints, OpenAPI/Scalar docs, rate limits, health checks.
   - Failure modes: auth bypass, route validation holes, stream buffering, provider timeouts.
4. Data platform (`packages/db` + Postgres)
   - Responsibilities: Drizzle schema/migrations for auth tables, conversations, messages, skills, memories, audit/usage; migrations and seed/test data.
   - Failure modes: migration failure, weak constraints, cross-user data leaks, slow history/memory queries.
5. LLM chat orchestration + skills
   - Responsibilities: provider abstraction via AI SDK, streaming response protocol, prompt assembly from skill + history + memory, cancellation, token/cost metadata, deterministic fake provider for tests.
   - Failure modes: prompt leakage, cost spikes, incomplete assistant messages, missing abort propagation.
6. Personal memory/privacy controls
   - Responsibilities: opt-in memory records, view/edit/delete/disable, pgvector-backed retrieval when embeddings are configured, recency fallback, privacy-safe injection into prompts.
   - Failure modes: creepy/incorrect memory, cross-user retrieval, delete/export failures, sensitive category persistence.
7. Docker/dev/QA infrastructure
   - Responsibilities: Dockerfiles and Compose for FE/BE/Postgres, local dev scripts, test containers or test compose, Playwright/a11y/security/streaming verification artifacts.
   - Failure modes: compose-only path diverges from dev path, health checks lie, CI cannot reproduce local stack.

## Adopted defaults ledger

| Assumption | Default I will plan | Rationale | Reversible? |
|---|---|---|---|
| Intent routing | Treat as greenfield architecture/bootstrap | User gave core requirements but not product-level details; best-practice defaults avoid a long interview | Yes |
| Directory layout | `apps/fe`, `apps/be`, `packages/db`, `packages/shared`, `packages/config` | Satisfies FE/BE under repo and keeps shared contracts/database isolated | Yes, before implementation |
| Package/task manager | Bun workspaces + Turbo task graph | TypeScript skill defaults to Bun; Next docs support Bun; Turbo is standard for monorepo orchestration | Yes, but lockfile/workspace changes touch many files |
| Frontend | Next.js latest App Router, TypeScript, Tailwind v4, React 19, RSC by default with small client islands | Matches user requirement and modern Next defaults | Partly |
| Backend runtime | Hono TypeScript on Bun, with a Node-compatible fetch/app boundary | Hono runs well on Bun; keeps TS-first dev fast; Docker can use `oven/bun` | Yes |
| API contracts | Hono OpenAPI docs via `@hono/zod-openapi` or `hono-openapi` + Scalar; Zod schemas at every boundary | Keeps FE/BE contracts explicit and testable | Yes |
| Auth | Better Auth mounted in Hono with Drizzle/Postgres adapter, HttpOnly SameSite=Lax cookies, email/password local baseline, OAuth/OIDC pluggable later | Better Auth directly supports Hono + Drizzle and avoids hand-rolled sessions; hosted OIDC can be added via provider abstraction | Yes with migration |
| Authorization | Resource ownership checks in backend service/policy functions; every user-owned query scoped by `userId`; frontend checks are UX only | Prevents cross-user chat/history/memory access | Yes, can evolve to RBAC/ABAC/RLS |
| LLM SDK | Vercel AI SDK (`ai`, `@ai-sdk/react`) with Hono streaming response; fake provider for tests; real provider via env | Official Hono cookbook supports UI message streaming; frontend `useChat` handles stream state | Yes |
| LLM provider | Default env-driven provider adapter (OpenAI-compatible or AI Gateway), no hardcoded provider secrets; missing key uses test/mock only, not silent prod fallback | User did not choose provider; adapter avoids blocking | Yes |
| Skills | User-owned prompt/model setting records selected per conversation; snapshot skill prompt into LLM run for history reproducibility | Matches “add skills for LLMs” without unsafe code/tool execution | Yes |
| Memory | Opt-in personal memory table, user CRUD, pgvector image/extension for semantic retrieval, deterministic fake embedder in tests, no auto-saving sensitive categories without explicit user action | Memory is privacy-sensitive; pgvector keeps vectors in Postgres per requirement | Yes |
| Docker | `docker-compose.yml` includes `fe`, `be`, `postgres`; FE uses Next standalone build; BE uses Bun production image; local dev uses root dev scripts plus optional Postgres service | Satisfies Docker Compose for FE/BE and non-container local dev | Yes |
| UI style | ChatGPT-like information architecture, not copied branding: neutral high-contrast command-center design, root `DESIGN.md` first, no emojis, SVG icons only | Avoids trademark copying and frontend slop; required by design skill | Yes |
| Tests | TDD for behavior; unit + API integration + DB migration + streaming + Playwright E2E + axe a11y + Docker smoke | Architecture-scale core app needs agent-executable QA for every requirement | No, should not weaken |
| Git | Initialize git only if worker confirms user wants this directory versioned; otherwise plan can include as first optional infrastructure step | Current folder is not a git repo; committing was not requested | Yes |

## Approach to plan after approval

Write one decision-complete work plan that scaffolds the greenfield monorepo in waves:

1. Foundation: workspace, strict TS/Biome/Turbo, env validation, README, root scripts.
2. Design/API/data contracts: `DESIGN.md`, shared branded IDs/types, Drizzle schema/migrations, OpenAPI baseline.
3. Auth/authorization: Better Auth, session middleware, protected routes, ownership policies.
4. Core chat/history: conversations/messages APIs and ChatGPT-like FE shell with streaming mock provider first.
5. LLM integration/skills: AI SDK streaming, skill CRUD/selection, prompt snapshots, token/usage metadata.
6. Memory: opt-in CRUD, pgvector setup, retrieval/injection rules, privacy controls.
7. Docker/local dev: Dockerfiles, compose, health checks, migration/seed workflows.
8. Verification: automated unit/integration/migration/streaming/E2E/a11y/security/Docker evidence artifacts and final review wave.

## Approval gate

I treated the request as open-ended and chose defaults. If the user approves, the next planner action is only to write `.omo/plans/chatgpt-like-monorepo.md` and run the required plan reviews. Approval is not permission to implement; execution starts only after the user later runs/asks `$start-work`.
