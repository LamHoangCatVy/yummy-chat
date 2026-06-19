---
slug: yummy-chat-monorepo
status: drafting
intent: unclear
pending-action: write .omo/plans/yummy-chat-monorepo.md
approach: Scaffold a greenfield Bun/Turbo TypeScript monorepo with Next.js latest frontend, Hono backend, Drizzle/Postgres data package, shared contracts, Docker Compose, auth, chat/history, LLM skills, opt-in personal memory, and automated QA gates.
---

# Draft: yummy-chat-monorepo

## Components (topology ledger)
<!-- Lock the SHAPE before depth. One row per top-level component that can succeed or fail independently. -->
<!-- id | outcome (one line) | status: active|deferred | evidence path -->
1 | Monorepo/tooling foundation: root workspace, task graph, strict TS/Biome, env validation, docs | active | approved request + repo finding in this draft lines 40-49
2 | Frontend web app: ChatGPT-like Next.js App Router UI with auth, chat, history, skills, memory screens | active | approved request + frontend findings in this draft lines 42,48
3 | Backend API: Hono routes, validation, auth/session middleware, authorization, streaming chat, OpenAPI/Scalar | active | approved request + backend findings in this draft lines 43-46
4 | Data platform: Drizzle/Postgres schema, migrations, constraints, indexes, seed/test data | active | approved request + DB findings in this draft lines 45-46
5 | LLM orchestration + skills: AI SDK provider adapter, streaming protocol, prompt assembly, cancellation, prompt presets | active | approved request + AI SDK finding in this draft line 44
6 | Personal memory/privacy: opt-in structured memory CRUD, deletion/disable/privacy controls, semantic/vector retrieval deferred | active | approved request + decisions in this draft lines 57-58
7 | Docker/dev/QA infrastructure: FE/BE/Postgres compose, local dev scripts, agent-executable verification artifacts | active | approved request + decisions in this draft lines 59-60

## Open assumptions (announced defaults)
<!-- Intent is UNCLEAR: research resolves ambiguity, defaults are adopted (not asked), and each is surfaced in the plan's human TL;DR for veto. -->
<!-- assumption | adopted default | rationale | reversible? -->
Intent routing | UNCLEAR/open-ended bootstrap | Requirements name stack and core features but not product decisions; best-practice defaults are appropriate and surfaced for veto | Yes
Directory layout | apps/fe, apps/be, packages/db, packages/shared, packages/config | Keeps FE/BE under yummy-chat while isolating shared contracts/data/config | Yes early
Package/task manager | Bun workspaces plus Turbo | TypeScript stack defaults to Bun; Next supports Bun; Turbo standardizes monorepo tasks | Yes early
Frontend | Next.js latest App Router + Tailwind + RSC default | User requested latest Next.js and ChatGPT-like UI; RSC minimizes hydration | Partly
Backend | Hono TypeScript on Bun with fetch-compatible app boundary | User requested Hono TS; Bun is TS-first and Docker-friendly | Yes
Auth | Better Auth with Hono + Drizzle/Postgres, HttpOnly SameSite=Lax cookies | Avoids hand-rolled sessions and has documented Hono/Drizzle integration | Yes with migration
Authorization | Backend ownership policy functions and user-scoped queries | Prevents cross-user history/memory leaks | Yes
LLM SDK | Vercel AI SDK Hono streaming, env-driven provider adapter, deterministic fake for tests | Official AI SDK Hono cookbook supports UI message streams | Yes
Skills | User-owned prompt/model presets; snapshot selected skill into chat runs | Delivers “add skills for LLMs” without unsafe arbitrary tool execution | Yes
Memory | Opt-in structured memory CRUD first; defer pgvector/semantic retrieval until after MVP | Memory is privacy-sensitive and structured notes satisfy the core requirement with less Docker/provider complexity | Yes
Docker | Compose includes fe, be, postgres; local dev uses dev servers and optional DB service | Matches user requirement | Yes
UI style | ChatGPT-like information architecture but original neutral command-center design; DESIGN.md first | Avoids brand copying and satisfies frontend design-system gate | Yes
Testing | TDD for behavior and agent-executable QA across unit/integration/migration/streaming/E2E/a11y/security/Docker | Core app needs release-blocking verification | No
Git | Do not commit unless user later requests; plan may initialize git only as optional worker step | Folder is not a git repo and commit was not requested | Yes

## Findings (cited - path:lines)
- Repository is greenfield: direct inspection found no application code, package manifests, Docker files, tests, CI, README, DESIGN.md, or `.git`; only `.codegraph`, `.opencode`, and `.omo` tooling/state existed before planning.
- Next.js docs support create-next-app with Bun/pnpm/npm/yarn, App Router defaults, Tailwind, runtime env in App Router, and standalone output for Docker; Context7 query `/vercel/next.js/v16.2.9`.
- Hono docs support JWT middleware, CORS, logger/etag, custom middleware, and SSE timeout/abort patterns; Context7 query `/websites/hono_dev`.
- AI SDK Hono cookbook supports `streamText` and `toUIMessageStreamResponse()` from a Hono server; webfetch `https://ai-sdk.dev/cookbook/api-servers/hono`.
- Drizzle docs support Postgres `pgTable`, relations, migrations, and node-postgres/postgres.js connections; Context7 query `/drizzle-team/drizzle-orm-docs`.
- Better Auth docs support Hono handler mounting, CORS before auth routes, Hono session middleware, cross-domain cookies, and Drizzle adapter; webfetch `https://www.better-auth.com/docs/integrations/hono` and web search Better Auth Drizzle adapter.
- pgvector official docs provide a future-compatible semantic retrieval path, but first implementation defers vector memory until structured memory works.
- Frontend skill requires root `DESIGN.md` before UI work, React dev tooling gated to development, no emojis as icons, real-browser visual QA at mobile/tablet/desktop breakpoints; frontend references loaded in session.
- Programming skill requires strict TypeScript, Zod at boundaries, Drizzle for DB, Hono backend, Biome, TDD, no `any`, no unsafe assertions, and source modules below 250 pure LOC; TypeScript references loaded in session.

## Decisions (with rationale)
1. Plan uses `yummy-chat-monorepo` slug because the initial hand-written draft used `chatgpt-like-monorepo` and scaffold refused to overwrite a non-artifact draft. The plan path is `.omo/plans/yummy-chat-monorepo.md`.
2. Plan does not edit product code; it will be a worker-executable `.omo` artifact only.
3. Plan will require implementation to create `DESIGN.md` before frontend components.
4. Plan will require a Next.js same-origin `/api/v1/*` proxy to the Hono backend to avoid Better Auth cookie/domain drift across local dev and Docker Compose.
5. Plan will require `postgres.js` for Drizzle on Bun, Postgres 16 pinning, `/api/v1` route prefix, shared error envelope, request IDs, and explicit rate-limit defaults.
6. Plan will require a mock/fake LLM provider before real provider integration so streaming and persistence can be tested deterministically.
7. Plan will require memory to be opt-in with explicit view/edit/delete/disable controls; pgvector semantic retrieval is documented as post-MVP, not part of the first implementation.
8. Plan will require Docker Compose production-ish stack plus local dev scripts that do not force FE/BE into Docker.
9. Plan will require all verification evidence under `.omo/evidence/` and no human-only success criteria.

## Scope IN
- Greenfield monorepo scaffolding under `yummy-chat`.
- Next.js latest frontend under `apps/fe`.
- Hono TypeScript backend under `apps/be`.
- Shared packages for DB, shared schemas/types, and config.
- Postgres database using Drizzle schema/migrations.
- Auth/authz, chat/history, LLM skills, personal memory.
- Dockerfiles and Docker Compose for FE/BE/Postgres.
- Local dev workflow through dev servers.
- Automated verification stack and final review wave.

## Scope OUT (Must NOT have)
- No product-code edits by Prometheus/planner.
- No copied ChatGPT/OpenAI branding, logos, or proprietary visual assets.
- No frontend direct access to Postgres or LLM provider secrets.
- No hand-rolled password/session crypto when Better Auth can own it.
- No arbitrary code-execution “skills” or unbounded external tools in MVP.
- No automatic storage of sensitive personal memory categories without explicit user action.
- No Docker-only local development requirement.
- No human-only QA signoff; every acceptance criterion must be agent-executable.
- No commits/pushes unless explicitly requested later.

## Open questions
None. Ambiguities were resolved to announced best-practice defaults for the approved plan.

## Approval gate
status: approved
approved-by-user: yes, user replied "approve"
approved-action: write .omo/plans/yummy-chat-monorepo.md only; do not implement
<!-- When exploration is exhausted and unknowns are answered, set status: awaiting-approval. -->
<!-- That durable record is the loop guard: on a later turn read it and resume at the gate instead of re-running exploration. -->
