# vercel-ai-sdk-multi-provider-implementation - Work Plan

## TL;DR (For humans)
**What you'll get:** The app will move from the direct OpenAI SDK to Vercel AI SDK while supporting OpenAI, Anthropic, Google Gemini, and custom OpenAI-compatible providers. Users will be able to save multiple provider credentials, choose the active provider/model, and keep existing single-provider settings through migration.

**Why this approach:** It keeps the current chat streaming behavior stable while changing the provider layer underneath, then expands settings/model selection in a controlled way. Tests are added before migration so the worker can prove current behavior did not regress.

**What it will NOT do:** It will not switch the frontend to Vercel's chat UI protocol, use AI Gateway as the main path, make real provider calls in tests, or expose stored API keys.

**Effort:** Large
**Risk:** Medium - schema/API/UI migration plus provider-streaming parity, mitigated by characterization tests and keeping the existing SSE contract.
**Decisions to sanity-check:** First native providers are OpenAI, Anthropic, and Google Gemini; BYOK remains available for OpenAI-compatible endpoints; multiple saved provider credentials are in scope.

Your next move: start work now, or request the optional high-accuracy review first. Full execution detail follows below.

---

> TL;DR (machine): Large/Medium plan to add characterization tests, AI SDK provider adapter/factory, multi-provider credential persistence/API/UI, model selection, dependency cleanup, and full verification while preserving custom SSE.

## Scope
### Must have
- Preserve existing custom chat stream wire protocol: SSE events named `text`, `reasoning`, `finish`, `error`, and `file` continue to be parsed by the existing frontend hook.
- Replace raw `openai` SDK usage with Vercel AI SDK packages: `ai`, `@ai-sdk/openai`, `@ai-sdk/anthropic`, `@ai-sdk/google`, and `@ai-sdk/openai-compatible`.
- Keep the existing internal `LLMProvider` contract as the application boundary; implement Vercel AI SDK behind that boundary instead of rewriting orchestration or the frontend streaming hook.
- Support provider kinds exactly: `openai`, `anthropic`, `google`, and `openai-compatible`.
- Support multiple saved user provider credentials with encrypted keys, display names, provider kind, optional endpoint, selected/default model, and one default provider per user.
- Preserve current single-provider users through a migration/backward-compatible read path from existing `user_api_settings` rows.
- Extend chat stream and title generation bodies to accept an optional `providerId`; if absent, resolve to the user's default provider, then server provider env, then fake provider.
- Keep OpenAI-compatible model discovery via the existing `/models` style fetch; use deterministic configured/static catalogs for native OpenAI/Anthropic/Google models unless a provider-specific listing API is already testable without real calls.
- Add characterization/regression tests before changing provider internals.
- Update shared schemas, backend routes, frontend settings/model UI, package dependencies, env docs, and tests.
### Must NOT have (guardrails, anti-slop, scope boundaries)
- Do not convert the frontend to `ai/react useChat` or the AI SDK data-stream protocol in this pass.
- Do not use Vercel AI Gateway as the primary provider route in this pass.
- Do not make real OpenAI/Anthropic/Google/custom endpoint calls in automated tests; mock/stub all provider/network calls.
- Do not remove or weaken `FakeLLMProvider` behavior used for local development and deterministic tests.
- Do not return, log, stream, or serialize raw API keys, encrypted payload internals, authorization headers, or decrypted key material.
- Do not break existing PPTX/XLSX file-generation post-processing from accumulated assistant text.
- Do not ignore GitNexus impact rules: run impact before editing touched symbols and `detect_changes()` before commit.
- Do not overwrite unrelated untracked `.omo/run-continuation/*.json` files currently present in the worktree.

## Verification strategy
> Zero human intervention - all verification is agent-executed.
- Test decision: TDD/characterization-first. Add or update Vitest/Playwright tests before changing the behavior they pin.
- Backend framework: Vitest zero-config via `npm run test -w @yummy/be`, targeted route/lib tests via `npx vitest run <files>` from `apps/be` or workspace script equivalents.
- Frontend contract framework: Vitest via `npm run test:contracts -w @yummy/fe`.
- Frontend E2E smoke framework: Playwright via `npm run smoke:advanced -w @yummy/fe` after UI changes.
- Static gates: `npm run lint`, `npm run typecheck`, `npm run test`, `npm run check` from repo root where feasible.
- Graph gates: run `gitnexus_impact` before edits to each major symbol group and `gitnexus_detect_changes({scope:"all"})` before commit.
- Evidence: each todo writes command output or a concise verifier note to `.omo/evidence/task-<N>-vercel-ai-sdk-multi-provider-implementation.md`.

## Execution strategy
### Parallel execution waves
> Target 5-8 todos per wave. Fewer than 3 (except the final) means you under-split.
- Wave 0: Safety and characterization tests. These are blocking and should run before implementation edits that alter behavior.
- Wave 1: Shared contracts, database schema, settings/model APIs. Contract and persistence work can parallelize after Wave 0 because provider internals are not yet changed.
- Wave 2: Vercel AI SDK provider adapter/factory and backend chat/title route integration. This depends on contract decisions and provider persistence.
- Wave 3: Frontend advanced settings/model selector/chat wiring. This depends on shared schemas and backend route shapes.
- Wave 4: Cleanup, docs, dependency lockfile, full verification, and graph impact review.

### Dependency matrix
| Todo | Depends on | Blocks | Can parallelize with |
| --- | --- | --- | --- |
| 1 | none | 4, 8, 9 | 2, 3 |
| 2 | none | 5, 6, 7, 11 | 1, 3 |
| 3 | none | 10, 12, 13 | 1, 2 |
| 4 | 1, 2 | 5, 6, 7, 11, 12, 13 | none |
| 5 | 2, 4 | 6, 7, 9, 14 | 8 |
| 6 | 4, 5 | 11, 12 | 7, 8 |
| 7 | 4, 5 | 13 | 6, 8 |
| 8 | 1, 4 | 9, 10, 14 | 5, 6, 7 |
| 9 | 5, 6, 8 | 10, 13, 14 | 11, 12 |
| 10 | 8, 9 | 14 | 11, 12, 13 |
| 11 | 4, 6 | 12, 13 | 9, 10 |
| 12 | 6, 11 | 13 | 9, 10 |
| 13 | 7, 9, 11, 12 | 14 | 10 |
| 14 | all prior todos | final verification | none |

## Todos
> Implementation + Test = ONE todo. Never separate.
<!-- APPEND TASK BATCHES BELOW THIS LINE WITH edit/apply_patch - never rewrite the headers above. -->
- [x] 1. Add backend characterization tests for current chat/title/provider behavior
  What to do / Must NOT do: Add tests that pin current behavior before provider replacement: custom SSE event names/payloads, fake-provider fallback, BYOK invalid-key path not falling back to fake text, redacted provider errors, title generation calling non-streaming completion with the requested model, and abort propagation where currently testable. Add a `generate-title` route test if there is no focused title route coverage. Do not change production behavior in this todo except tiny testability-safe exports if absolutely necessary; if exporting a helper, keep it internal to backend tests.
  Parallelization: Wave 0 | Blocked by: none | Blocks: 4, 8, 9
  References (executor has NO interview context - be exhaustive): `apps/be/src/routes/chat.ts:64-100`, `apps/be/src/routes/chat.ts:250-430`, `apps/be/src/routes/generate-title.ts:42-63`, `apps/be/src/routes/generate-title.ts:177-200`, `apps/be/src/lib/llm/provider.ts:63-91`, `apps/be/src/lib/llm/fake-provider.ts:67-150`, `apps/be/src/routes/chat.test.ts:357-434`, `apps/be/src/lib/chat/orchestrator.test.ts:72-143`.
  Acceptance criteria (agent-executable): `npm run test -w @yummy/be -- src/routes/chat.test.ts src/routes/generate-title.test.ts src/lib/chat/orchestrator.test.ts` passes, or if npm script arg forwarding is unsupported, run equivalent `npx vitest run` commands from `apps/be` and record them. Tests fail if `text`/`reasoning`/`finish`/`error` event handling changes or title completion stops using the selected model.
  QA scenarios (name the exact tool + invocation): Happy: `npx vitest run src/routes/chat.test.ts src/routes/generate-title.test.ts` from `apps/be` shows SSE/title characterization passing. Failure: intentionally inspect test assertions or use a local stub to confirm fake fallback and invalid BYOK are distinguishable; record assertion names. Evidence `.omo/evidence/task-1-vercel-ai-sdk-multi-provider-implementation.md`.
  Commit: Y | test(ai): characterize current provider and streaming behavior

- [x] 2. Add backend/shared characterization tests for current settings and model contracts
  What to do / Must NOT do: Pin the current single-provider settings and model-listing contracts before replacing them: encrypted key never returned, endpoint normalization, `/models` requires BYOK key, OpenAI-compatible `{data:[{id}]}` parsing, cache invalidation after settings update, FE contract parsing of `advancedSettingsGetResponseSchema`, `advancedSettingsPutInputSchema`, and `modelListResponseSchema`. Do not introduce multi-provider production schema yet in this todo.
  Parallelization: Wave 0 | Blocked by: none | Blocks: 5, 6, 7, 11
  References (executor has NO interview context - be exhaustive): `apps/be/src/routes/settings.ts:47-64`, `apps/be/src/routes/settings.ts:73-82`, `apps/be/src/routes/settings.ts:116-240`, `apps/be/src/routes/models.ts:50-202`, `packages/shared/src/schemas.ts:139-157`, `apps/be/src/routes/settings.test.ts:136-375`, `apps/fe/tests/api-contract.test.ts:219-238`.
  Acceptance criteria (agent-executable): `npx vitest run src/routes/settings.test.ts src/routes/models.test.ts` from `apps/be` and `npm run test:contracts -w @yummy/fe` pass with added characterization assertions.
  QA scenarios (name the exact tool + invocation): Happy: valid mocked endpoint returns models and settings response excludes raw/encrypted key fields. Failure: mocked 401 endpoint returns validation/auth error and no key material appears in JSON. Evidence `.omo/evidence/task-2-vercel-ai-sdk-multi-provider-implementation.md`.
  Commit: Y | test(settings): characterize single-provider settings and models contracts

- [x] 3. Add frontend characterization tests for current advanced settings, model selection, and chat stream assumptions
  What to do / Must NOT do: Add/extend tests that pin FE assumptions before UI changes: advanced settings form sends `{apiKey, endpoint}` only when provided, model selector consumes flat `{models:[{id,label?}]}` and auto-selects first model, chat stream request includes `model` defaulting to `gpt-5-nano`, and custom SSE payloads update assistant text/reasoning/files. Do not redesign UI in this todo.
  Parallelization: Wave 0 | Blocked by: none | Blocks: 10, 12, 13
  References (executor has NO interview context - be exhaustive): `apps/fe/src/app/settings/advanced/page.tsx:28-92`, `apps/fe/src/components/models/model-selector.tsx:15-62`, `apps/fe/src/components/chat/use-stream-chat.ts:117-241`, `apps/fe/src/components/chat/chat-container.tsx:50-83`, `apps/fe/tests/api-contract.test.ts:472-558`, `apps/fe/tests/e2e/advanced-smoke.spec.ts:169-238`.
  Acceptance criteria (agent-executable): `npm run test -w @yummy/fe` passes with the added/updated Vitest tests. If component tests are not already configured, keep this todo to API-contract/hook-level tests and document the limitation in evidence.
  QA scenarios (name the exact tool + invocation): Happy: mocked fetch returns model list and selected model is sent to chat/title helpers. Failure: malformed model/settings payload is rejected by Zod schema and does not silently pass. Evidence `.omo/evidence/task-3-vercel-ai-sdk-multi-provider-implementation.md`.
  Commit: Y | test(fe): characterize provider settings and model selection assumptions

- [x] 4. Introduce shared multi-provider schemas and model-selection contracts
  What to do / Must NOT do: Extend shared schemas/types with `providerKindSchema = z.enum(["openai","anthropic","google","openai-compatible"])`, provider summary/detail schemas, create/update provider input schemas, active/default provider input schema, and model list items that include provider metadata. Preserve backward-compatible legacy fields on advanced settings GET (`hasApiKey`, `endpoint`, `selectedModel`) as a projection of the active/default provider during migration. Define chat/title request contract additions as optional `providerId?: string` while preserving required/validated `model`. Do not remove existing exported schema names that current FE imports.
  Parallelization: Wave 1 | Blocked by: 1, 2 | Blocks: 5, 6, 7, 11, 12, 13
  References (executor has NO interview context - be exhaustive): `packages/shared/src/schemas.ts:139-157`, `packages/shared/src/index.ts:29-94`, `apps/fe/tests/api-contract.test.ts:219-238`, `apps/fe/src/lib/api.ts:213-229`.
  Acceptance criteria (agent-executable): `npm run test -w @yummy/shared` and `npm run test:contracts -w @yummy/fe` pass. New tests prove valid provider kinds parse, invalid provider kinds fail, legacy advanced settings fields remain present, and model items can include provider/providerId labels.
  QA scenarios (name the exact tool + invocation): Happy: parse a response with two providers and one active provider. Failure: parse rejects empty provider name, invalid provider kind, invalid endpoint for OpenAI-compatible provider, and duplicate/empty model IDs in test data. Evidence `.omo/evidence/task-4-vercel-ai-sdk-multi-provider-implementation.md`.
  Commit: Y | feat(shared): define multi-provider AI settings contracts

- [x] 5. Add multi-provider persistence and legacy migration path
  What to do / Must NOT do: Add a new Drizzle schema/table for saved providers instead of trying to force multiple rows into the existing unique `user_api_settings` table. Required columns: `id`, `userId`, `providerKind`, `displayName`, `encryptedApiKey`, `endpoint`, `selectedModel`, `isDefault`, `createdAt`, `updatedAt`. Add indexes/constraints for user lookup and provider ownership. Add a migration that creates the new table and backfills one default `openai-compatible` provider from existing `user_api_settings` rows where `encrypted_api_key` or `endpoint` exists. Keep the old table/schema available for backward-compatible reads during this migration; do not drop it in this pass. Add repository helpers for list/get/create/update/delete/setDefault scoped by actor/user.
  Parallelization: Wave 1 | Blocked by: 2, 4 | Blocks: 6, 7, 9, 14
  References (executor has NO interview context - be exhaustive): `packages/db/src/schema/api-settings.ts:6-24`, `packages/db/src/schema/index.ts:1-8`, `packages/db/drizzle/0003_add_api_settings.sql:1-12`, `apps/be/src/lib/repositories.ts:379-424`, `packages/db/src/client.test.ts:99-106`.
  Acceptance criteria (agent-executable): `npm run test -w @yummy/db` passes; backend repository tests prove multi-provider CRUD is user-scoped, only one default provider per user is produced by repository logic, and legacy data is readable/backfilled in migration SQL review. If DB migration execution is available, run the existing migration/test DB command and record output.
  QA scenarios (name the exact tool + invocation): Happy: create two providers for one user, set the second default, list returns both with exactly one default. Failure: user B cannot fetch/update/delete user A provider, and deleting default selects a deterministic fallback or leaves no default according to repository test expectation. Evidence `.omo/evidence/task-5-vercel-ai-sdk-multi-provider-implementation.md`.
  Commit: Y | feat(db): add saved AI provider credentials

- [x] 6. Replace advanced settings API with multi-provider CRUD while preserving legacy projection
  What to do / Must NOT do: Update `settingsRouter` to support: `GET /advanced` returning provider list + active/default provider + legacy fields; `POST /advanced/providers` creating a provider; `PATCH /advanced/providers/:providerId` updating display name/key/endpoint/model/default; `DELETE /advanced/providers/:providerId`; and `PUT /advanced/default` setting default provider. Keep existing `PUT /advanced` as a backward-compatible single-provider upsert that writes to the new provider table (default provider) and still returns the new GET response shape with legacy fields. Validate native provider keys without real calls in tests by dependency-injectable validation; validate OpenAI-compatible endpoint/key using existing `${endpoint}/models` pattern. Always encrypt key input and never return raw/encrypted key material.
  Parallelization: Wave 1 | Blocked by: 4, 5 | Blocks: 11, 12
  References (executor has NO interview context - be exhaustive): `apps/be/src/routes/settings.ts:25-257`, `apps/be/src/routes/models.ts:43-46`, `apps/be/src/lib/encryption.ts:1-72`, `apps/be/src/lib/redact.ts:1-156`, `apps/be/src/routes/settings.test.ts:136-375`, `packages/shared/src/schemas.ts:139-157`.
  Acceptance criteria (agent-executable): `npx vitest run src/routes/settings.test.ts` from `apps/be` passes. Tests cover create/update/delete/default, legacy `PUT /advanced`, endpoint validation failures, key secrecy, cross-user isolation, and cache invalidation.
  QA scenarios (name the exact tool + invocation): Happy: authenticated user creates OpenAI and custom endpoint providers, sets default, GET returns both and no key material. Failure: invalid provider kind, invalid provider ID, invalid endpoint validation, and cross-user access all return safe error responses. Evidence `.omo/evidence/task-6-vercel-ai-sdk-multi-provider-implementation.md`.
  Commit: Y | feat(api): add multi-provider advanced settings routes

- [x] 7. Update model listing API for provider-aware model catalogs
  What to do / Must NOT do: Update `modelsRouter` so `GET /api/v1/models?providerId=<id>` lists models for that saved provider, and no `providerId` means the user's default provider. Return provider-aware model items containing at least `{ id, label, provider, providerId }`, where `id` is the raw model ID sent to the chosen provider and UI can display provider context. For native providers, use deterministic server-side catalogs/config arrays for OpenAI, Anthropic, and Google with sensible defaults; for OpenAI-compatible providers, keep existing authenticated `${endpoint}/models` fetch and cache per user+provider+endpoint. Do not make native provider network calls in tests.
  Parallelization: Wave 1 | Blocked by: 4, 5 | Blocks: 13
  References (executor has NO interview context - be exhaustive): `apps/be/src/routes/models.ts:32-202`, `apps/be/src/routes/settings.ts:214-215`, `packages/shared/src/schemas.ts:139-146`, `apps/fe/src/components/models/model-selector.tsx:15-28`, `apps/be/src/routes/models.test.ts`.
  Acceptance criteria (agent-executable): `npx vitest run src/routes/models.test.ts src/routes/settings.test.ts` from `apps/be` passes. Tests cover default provider resolution, providerId selection, native static catalogs, OpenAI-compatible mocked fetch, cache key includes provider ID/endpoint, cache invalidates on provider update/delete, and cross-user isolation.
  QA scenarios (name the exact tool + invocation): Happy: saved Anthropic provider returns static Claude models; saved OpenAI-compatible provider fetches mocked `/models`. Failure: missing/foreign providerId returns not found/forbidden without leaking provider details; malformed OpenAI-compatible response returns safe internal error. Evidence `.omo/evidence/task-7-vercel-ai-sdk-multi-provider-implementation.md`.
  Commit: Y | feat(api): make model listing provider-aware

- [ ] 8. Implement Vercel AI SDK provider adapter and provider factory
  What to do / Must NOT do: Add AI SDK dependencies to backend package and lockfile. Replace the direct OpenAI SDK implementation with a new adapter, e.g. `apps/be/src/lib/llm/ai-sdk-provider.ts`, that implements existing `LLMProvider`. The adapter must accept provider kind, API key, optional endpoint/baseURL, and default model. It must construct the right AI SDK language model using `@ai-sdk/openai`, `@ai-sdk/anthropic`, `@ai-sdk/google`, or `@ai-sdk/openai-compatible`, call `streamText` for `stream()`, call `generateText` for `complete()`, map AI SDK text/reasoning/error/finish/usage into current `StreamChunk`/`CompleteResponse`, pass abort signals, and map typed AI SDK errors into redaction-safe `PROVIDER_ERROR` messages. Keep `FakeLLMProvider` untouched. Do not expose AI SDK stream protocol directly to FE.
  Parallelization: Wave 2 | Blocked by: 1, 4 | Blocks: 9, 10, 14
  References (executor has NO interview context - be exhaustive): `apps/be/src/lib/llm/provider.ts:1-91`, `apps/be/src/lib/llm/openai-provider.ts:1-141`, `apps/be/src/lib/llm/fake-provider.ts:1-185`, `apps/be/package.json:18-31`, `package-lock.json`, Vercel AI SDK docs for `streamText`, `generateText`, provider registry, `@ai-sdk/openai-compatible`, `APICallError`, `NoSuchModelError`, `NoSuchProviderError`.
  Acceptance criteria (agent-executable): New unit tests for the adapter pass without real provider calls by mocking AI SDK functions/providers. Tests prove text deltas, reasoning deltas when present, usage, finish reason, abort finish, provider errors, missing model/provider errors, and non-streaming title completion all map to existing app types. `npm run typecheck -w @yummy/be` passes.
  QA scenarios (name the exact tool + invocation): Happy: mocked `streamText` yields text/reasoning/finish and adapter yields current `StreamChunk` sequence; mocked `generateText` returns content/usage. Failure: mocked AI SDK `APICallError` containing `sk-...` key maps to redacted/safe error chunk after route-level redaction, and abort signal yields finishReason `abort`. Evidence `.omo/evidence/task-8-vercel-ai-sdk-multi-provider-implementation.md`.
  Commit: Y | feat(llm): add Vercel AI SDK provider adapter

- [ ] 9. Update chat/title provider resolution to use saved providers and AI SDK adapter
  What to do / Must NOT do: Refactor duplicated provider resolution in chat and title routes into a shared backend helper, e.g. `apps/be/src/lib/llm/provider-resolver.ts`. Resolution order must be: explicit `providerId` belonging to user; user's default saved provider; server env provider (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY` or chosen Google env name documented in env helper); fake provider env overrides used by tests; final `FakeLLMProvider`. Extend chat stream input and title input to accept optional `providerId`, keep `model` validation, and strip/normalize provider-prefixed model IDs only inside resolver/adapter. Preserve legacy bare OpenAI model support (`gpt-5-nano`) when no provider is specified. Do not duplicate resolver logic in routes.
  Parallelization: Wave 2 | Blocked by: 5, 6, 8 | Blocks: 10, 13, 14
  References (executor has NO interview context - be exhaustive): `apps/be/src/routes/chat.ts:54-100`, `apps/be/src/routes/chat.ts:199-233`, `apps/be/src/routes/generate-title.ts:35-63`, `apps/be/src/routes/generate-title.ts:170-185`, `apps/be/src/lib/env.ts:24-35`, `apps/be/src/lib/chat/orchestrator.ts:117-143`, `apps/be/src/routes/chat.test.ts:357-434`.
  Acceptance criteria (agent-executable): `npx vitest run src/routes/chat.test.ts src/routes/generate-title.test.ts src/lib/llm/ai-sdk-provider.test.ts` from `apps/be` passes. Tests prove explicit providerId, default saved provider, server env provider, fake env override, and no-config fake fallback each resolve deterministically.
  QA scenarios (name the exact tool + invocation): Happy: user with two saved providers sends chat with providerId B and route uses provider B; title generation uses the same providerId/model. Failure: foreign providerId returns validation/not-found error without using fake fallback; invalid model/provider errors stream safe `error` event. Evidence `.omo/evidence/task-9-vercel-ai-sdk-multi-provider-implementation.md`.
  Commit: Y | feat(chat): resolve chat providers from saved AI settings

- [ ] 10. Update backend env, docs, and validation for multi-provider server keys
  What to do / Must NOT do: Extend `env.ts`, `.env.example`, README, and `scripts/check-env.ts` if needed with documented optional keys/default models for OpenAI, Anthropic, Google, and OpenAI-compatible defaults. Keep `OPENAI_API_KEY`/`OPENAI_MODEL` backward compatible. Decide and document exact Google env var name once, preferably the provider package default if documented, otherwise `GOOGLE_GENERATIVE_AI_API_KEY`. Mark `LLM_PROVIDER_API_KEY` as legacy/unused or remove only if no code/tests depend on it. Do not require any provider key for local dev because fake provider fallback must remain.
  Parallelization: Wave 2/4 | Blocked by: 8, 9 | Blocks: 14
  References (executor has NO interview context - be exhaustive): `apps/be/src/lib/env.ts:14-47`, `.env.example:8-17`, `README.md` LLM/environment sections, `scripts/check-env.ts`, `docker-compose.yml` provider env entry, `apps/be/package.json:18-31`.
  Acceptance criteria (agent-executable): `npm run check-env` succeeds with default/example local env expectations, `npm run typecheck -w @yummy/be` passes, docs mention no real keys are required for fake-provider local dev.
  QA scenarios (name the exact tool + invocation): Happy: empty provider keys do not fail env check in development. Failure: required `USER_API_KEY_ENCRYPTION_SECRET` behavior remains unchanged and missing required auth/db env still fail as before. Evidence `.omo/evidence/task-10-vercel-ai-sdk-multi-provider-implementation.md`.
  Commit: Y | docs(env): document multi-provider AI configuration

- [ ] 11. Update frontend API client and shared contract tests for provider CRUD
  What to do / Must NOT do: Update `apps/fe/src/lib/api.ts` to expose typed helpers for listing advanced settings, creating/updating/deleting providers, setting default provider, and fetching models with optional providerId. Update FE contract tests to use the new schemas and preserve legacy advanced settings parsing. Do not hardcode secrets or bypass Zod validation.
  Parallelization: Wave 3 | Blocked by: 4, 6 | Blocks: 12, 13
  References (executor has NO interview context - be exhaustive): `apps/fe/src/lib/api.ts:213-229`, `apps/fe/tests/api-contract.test.ts:219-238`, `apps/fe/tests/api-contract.test.ts:472-558`, `packages/shared/src/index.ts:29-94`, `packages/shared/src/schemas.ts:139-157`.
  Acceptance criteria (agent-executable): `npm run test:contracts -w @yummy/fe` passes. Tests prove request bodies for create/update/default/delete are correct and responses parse provider arrays and model items with provider metadata.
  QA scenarios (name the exact tool + invocation): Happy: mocked GET advanced response with multiple providers parses and API helper returns typed data. Failure: mocked invalid provider kind/model shape rejects through schema, and failed response still propagates `ApiError`. Evidence `.omo/evidence/task-11-vercel-ai-sdk-multi-provider-implementation.md`.
  Commit: Y | feat(fe-api): add provider settings client contracts

- [ ] 12. Redesign advanced settings UI for multiple saved providers
  What to do / Must NOT do: Update the advanced settings page from one key/endpoint form to a multiple-provider management UI. Required interactions: list saved providers; create provider with display name/provider kind/key/endpoint where endpoint is required only for OpenAI-compatible; edit provider name/model/endpoint/key; set default provider; delete provider; show key configured without ever displaying key material; show provider validation errors. Keep visual style consistent with existing settings page. Do not add a hidden raw-key field or persist key in React state after successful save beyond the current input clear behavior.
  Parallelization: Wave 3 | Blocked by: 6, 11 | Blocks: 13
  References (executor has NO interview context - be exhaustive): `apps/fe/src/app/settings/advanced/page.tsx:27-208`, `apps/fe/src/lib/api.ts:213-229`, `apps/fe/tests/e2e/advanced-smoke.spec.ts:169-238`, `packages/shared/src/schemas.ts` provider schemas from Todo 4.
  Acceptance criteria (agent-executable): `npm run typecheck -w @yummy/fe`, `npm run lint -w @yummy/fe`, and updated focused FE tests pass. The page can create at least one OpenAI-compatible provider and one native provider using mocked/stubbed backend in tests or E2E fixture where available.
  QA scenarios (name the exact tool + invocation): Happy: user creates provider, sees `API key configured`, sets default, and model selector can use it. Failure: invalid endpoint/provider-specific required fields show an error and do not leave key text visible after failure beyond the input field. Evidence `.omo/evidence/task-12-vercel-ai-sdk-multi-provider-implementation.md`.
  Commit: Y | feat(fe): manage multiple AI providers in settings

- [ ] 13. Update model selector and chat/title FE flow to send providerId + model
  What to do / Must NOT do: Update model selection state to carry both `providerId` and `model`. Fetch models for the selected/default provider. Send `providerId` and `model` in chat stream requests and title generation requests. Preserve default behavior when no provider/model is available: backend fake provider fallback remains usable and UI shows a clear no-model state instead of crashing. Keep custom SSE parser unchanged except request body shape. Do not assume model IDs are globally unique across providers without providerId.
  Parallelization: Wave 3 | Blocked by: 7, 9, 11, 12 | Blocks: 14
  References (executor has NO interview context - be exhaustive): `apps/fe/src/components/models/model-selector.tsx:30-233`, `apps/fe/src/components/chat/chat-container.tsx:21-83`, `apps/fe/src/components/chat/chat-composer.tsx:17-101`, `apps/fe/src/components/chat/use-stream-chat.ts:84-128`, `apps/fe/src/lib/api.ts` `generateConversationTitle` helper, `apps/be/src/routes/chat.ts:54-60`, `apps/be/src/routes/generate-title.ts:35-37`.
  Acceptance criteria (agent-executable): `npm run test -w @yummy/fe`, `npm run typecheck -w @yummy/fe`, and updated backend chat/title route tests pass. If Playwright environment is available, `npm run smoke:advanced -w @yummy/fe` passes or produces a recorded environment-blocker note.
  QA scenarios (name the exact tool + invocation): Happy: selecting provider/model sends both fields in chat and title calls. Failure: duplicate model ID under two providers still sends the chosen providerId, and missing provider returns clear UI state/error without malformed requests. Evidence `.omo/evidence/task-13-vercel-ai-sdk-multi-provider-implementation.md`.
  Commit: Y | feat(chat): send selected provider with model requests

- [ ] 14. Remove direct OpenAI SDK dependency and run full verification/impact review
  What to do / Must NOT do: Remove all direct `openai` SDK imports/usages and the `openai` dependency from `apps/be/package.json` / root lockfile after AI SDK adapter parity is proven. Rename or delete old `openai-provider.ts` only after updating imports/tests; if kept as compatibility wrapper, it must use AI SDK internally and not import `openai`. Update README LLM statement to be accurate. Run full static/test gates and GitNexus change detection. Do not commit unrelated `.omo/run-continuation/*.json` files or other unrelated changes.
  Parallelization: Wave 4 | Blocked by: all prior todos | Blocks: final verification
  References (executor has NO interview context - be exhaustive): `apps/be/src/lib/llm/openai-provider.ts:1-141`, `apps/be/package.json:18-31`, `package-lock.json`, `README.md` LLM section, `ADD.md` historical OpenAI notes, GitNexus impact results in draft `.omo/drafts/vercel-ai-sdk-multi-provider-implementation.md`.
  Acceptance criteria (agent-executable): `grep`/content search finds no runtime `from "openai"`, `import("openai")`, or `new OpenAI` usage outside historical docs if intentionally retained. `npm run lint`, `npm run typecheck`, `npm run test`, `npm run check`, and `gitnexus_detect_changes({scope:"all", repo:"yummy-chat"})` complete with expected scope or documented environment blockers.
  QA scenarios (name the exact tool + invocation): Happy: full suite passes and lockfile contains AI SDK deps, not direct `openai` dependency for backend runtime. Failure: temporarily searching for raw OpenAI import returns zero production matches; any remaining match is documented as historical docs/test fixture only. Evidence `.omo/evidence/task-14-vercel-ai-sdk-multi-provider-implementation.md`.
  Commit: Y | chore(ai): remove direct OpenAI SDK after AI SDK migration

## Final verification wave
> Runs in parallel after ALL todos. ALL must APPROVE. Surface results and wait for the user's explicit okay before declaring complete.
- [ ] F1. Plan compliance audit: reviewer verifies every Must Have is implemented, every Must NOT Have is preserved, every todo has evidence, and no implementation silently switched to `ai/react useChat` or AI SDK data-stream protocol.
- [ ] F2. Code quality review: reviewer checks TypeScript strictness, no `any`/unsafe casts unless tightly justified, no duplicate provider-resolution logic in routes, no oversized/sloppy files, and clear separation of contracts/repository/provider adapter/UI.
- [ ] F3. Real manual QA: agent runs the app or route-level equivalent using fake provider and mocked/stubbed provider settings, creates providers, selects model/provider, sends a chat, generates title, and confirms SSE text/file behavior still works. Evidence path required.
- [ ] F4. Scope fidelity/security review: reviewer checks no raw/decrypted/encrypted API key material is returned/logged/streamed, cross-user provider access is blocked, no real provider calls are made in tests, and unrelated `.omo/run-continuation/*.json` files are untouched.

## Commit strategy
- Prefer 5 atomic commits matching waves:
  1. `test(ai): characterize current provider and settings behavior`
  2. `feat(shared-db): add multi-provider AI settings contracts`
  3. `feat(api): add AI SDK provider resolution and model APIs`
  4. `feat(fe): support multiple AI providers and models`
  5. `chore(ai): remove direct OpenAI SDK and verify migration`
- Before committing, inspect `git status`, `git diff`, and recent log; stage only intended product files and plan/evidence files requested by the workflow.
- Never commit raw `.env`, secrets, generated local DB files, or unrelated untracked `.omo/run-continuation/*.json` files.
- If hooks/tests fail, fix forward with a new commit; do not skip hooks.

## Success criteria
- No production backend code imports or dynamically imports the direct `openai` SDK.
- Chat streaming and title generation use Vercel AI SDK through the internal `LLMProvider` adapter/factory.
- Existing custom frontend SSE behavior remains compatible: text/reasoning/finish/error/file events still update the UI and persisted message metadata.
- Users can store multiple provider credentials, set a default provider, fetch provider-aware model lists, and send chat/title requests with selected provider + model.
- Existing single-provider settings are migrated/read compatibly so users do not lose configured key/endpoint/model.
- OpenAI, Anthropic, Google, and OpenAI-compatible provider kinds are represented in schemas, backend validation, model listing, and UI.
- Automated tests do not make real provider API calls and cover happy/failure paths for provider CRUD, model listing, provider resolution, stream mapping, title generation, key secrecy, and cross-user isolation.
- `npm run lint`, `npm run typecheck`, `npm run test`, `npm run check`, and GitNexus `detect_changes({scope:"all"})` pass or have explicit environment-blocker evidence.
