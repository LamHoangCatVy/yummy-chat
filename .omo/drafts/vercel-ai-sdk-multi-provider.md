# Draft: Vercel AI SDK multi-provider migration

status: awaiting-approval
pending_action: write `.omo/plans/vercel-ai-sdk-multi-provider.md` after explicit user approval
intent: CLEAR
classification: Architecture

## User request

Plan migration from direct OpenAI SDK usage to Vercel AI SDK, with support for multiple AI providers and models.

## Confirmed owner decisions

- Provider surface: official AI SDK providers plus OpenAI-compatible BYOK.
- Per-user credential model: multiple saved providers.
- Test strategy: characterization tests first, then migration.

## Components ledger

1. Backend provider adapter — Replace direct `openai` SDK concrete provider while preserving `LLMProvider` contract. Evidence: `apps/be/src/lib/llm/openai-provider.ts`, `apps/be/src/lib/llm/provider.ts`.
2. Provider resolution/config/env — Current `getProvider` / `resolveProviderForUser` exists in both chat and title routes. Evidence: `apps/be/src/routes/chat.ts`, `apps/be/src/routes/generate-title.ts`, `apps/be/src/lib/env.ts`.
3. Multi-provider persistence/API — Current `user_api_settings` supports one unique row per user with encrypted key, endpoint, selected model. Evidence: `packages/db/src/schema/api-settings.ts`, `packages/db/drizzle/0003_add_api_settings.sql`, `apps/be/src/routes/settings.ts`.
4. Model discovery/UI — Current `GET /models` assumes OpenAI-compatible `/models`; FE model selector consumes flat model list. Evidence: `apps/be/src/routes/models.ts`, `apps/fe/src/components/models/model-selector.tsx`.
5. Chat/title streaming contracts — Chat route streams text/reasoning/finish/error SSE and title generation calls `complete`. Evidence: `apps/be/src/routes/chat.ts`, `apps/be/src/routes/generate-title.ts`, `apps/fe/src/components/chat/use-stream-chat.ts`.
6. Tests/dependencies/docs — npm workspace, BE uses Vitest, FE API contract tests, direct dependency `openai@^6.44.0`. Evidence: root `package.json`, `apps/be/package.json`, `apps/be/src/routes/chat.test.ts`, `apps/be/src/routes/settings.test.ts`, `apps/fe/tests/api-contract.test.ts`.

## External docs evidence

- Vercel AI SDK v7 core provides `streamText` / `generateText` with provider-neutral model APIs.
- Official/provider registry supports registered `openai`, `anthropic`, etc. providers with prefixed model IDs, and typed errors such as `NoSuchModelError`, `NoSuchProviderError`, and `APICallError`.
- `@ai-sdk/openai-compatible` supports custom `baseURL` + API key for OpenAI-compatible gateways.
- AI Gateway can also route provider-prefixed model strings, but user selected official providers plus BYOK rather than Gateway-only.
- npm registry latest observed for planning: `ai@7.0.22`, `@ai-sdk/openai@4.0.11`, `@ai-sdk/anthropic@4.0.12`, `@ai-sdk/google@4.0.12`, `@ai-sdk/openai-compatible@3.0.7`.

## Research agent confirmations

- AI integration mapper confirmed there are no `ai` / `@ai-sdk/*` imports yet; the README claim is ahead of implementation.
- AI integration mapper confirmed two LLM usage paths: streaming chat (`POST /api/v1/chat/stream`) and non-streaming title generation (`POST /api/v1/conversations/:id/generate-title`).
- Test/config mapper confirmed npm workspaces + Turbo + strict TypeScript + Vitest zero-config; BE tests are co-located in `apps/be/src/**/*.test.ts`, FE contract tests live in `apps/fe/tests/api-contract.test.ts`.
- Test/config mapper confirmed dynamic imports after env setup are the existing BE test pattern; new provider/settings route tests should follow `apps/be/src/routes/chat.test.ts`, `settings.test.ts`, and `models.test.ts`.

## Impact/risk evidence

- GitNexus impact for `OpenAIProvider`: MEDIUM, 8 impacted symbols, direct callers in `chat.ts` and `generate-title.ts`, two provider-resolution flows.
- GitNexus impact for `LLMProvider`: MEDIUM, 13 impacted symbols, two implementations and route/orchestrator consumers.
- GitNexus API impact for indexed `/stream` POST: LOW route consumer risk but 3 provider-resolution flows. Route index appears incomplete for some settings/model routes.
- Dirty worktree note: pre-existing untracked `.omo/run-continuation/*.json` files are present and must remain out of implementation scope.

## Proposed approach awaiting approval

Write a plan that:

1. Adds characterization tests around current OpenAI/BYOK fallback, SSE chunk mapping, title completion, model listing, settings secrecy, and legacy settings migration.
2. Introduces a Vercel AI SDK adapter that implements existing `LLMProvider` and maps AI SDK stream/generate usage into current `StreamChunk`/`CompleteResponse` shapes.
3. Adds first-class provider resolution for OpenAI, Anthropic, Google, and OpenAI-compatible custom endpoints, with provider-prefixed model IDs and a legacy bare OpenAI model fallback.
4. Migrates persistence from one `user_api_settings` row toward multiple saved provider records while preserving existing users through migration/backward-compatible read paths.
5. Evolves shared schemas, BE routes, FE advanced settings/model selector, and API contract tests to manage multiple saved providers and active/default provider selection.
6. Removes direct `openai` SDK usage/dependency after parity tests pass, then runs lint/typecheck/test and GitNexus `detect_changes`.

## Open assumptions to bake into plan unless user changes scope

- First official providers in scope: OpenAI, Anthropic, Google Gemini.
- Keep existing fake provider for local dev/tests.
- Do not use Vercel AI Gateway as the primary path in this pass.
- Keep OpenAI-compatible BYOK model discovery via `/models`; for native providers, start with configured/static model catalogs unless provider model listing is officially available and testable without real keys.
- No real provider API calls in unit tests; use mocks/stubs only.
- Preserve the existing custom SSE wire protocol for this pass rather than switching FE to `ai/react useChat`; this minimizes UX/regression risk while still replacing provider internals with Vercel AI SDK.
