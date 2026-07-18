---
slug: vercel-ai-sdk-multi-provider-implementation
status: plan-written
intent: clear
pending-action: write .omo/plans/vercel-ai-sdk-multi-provider-implementation.md
approach: characterization-first migration from raw OpenAI SDK to Vercel AI SDK, preserving the existing LLMProvider and custom SSE protocol while adding official provider + OpenAI-compatible multi-BYOK support
---

# Draft: vercel-ai-sdk-multi-provider-implementation

## Components (topology ledger)
<!-- Lock the SHAPE before depth. One row per top-level component that can succeed or fail independently. -->
<!-- id | outcome (one line) | status: active|deferred | evidence path -->

| id | outcome | status | evidence path |
| --- | --- | --- | --- |
| C1 | Backend provider adapter implements existing `LLMProvider` with Vercel AI SDK instead of raw `openai` SDK | active | `apps/be/src/lib/llm/provider.ts:1-91`, `apps/be/src/lib/llm/openai-provider.ts:1-141` |
| C2 | Provider resolution supports server keys and multiple user-saved provider credentials for OpenAI, Anthropic, Google, and OpenAI-compatible endpoints | active | `apps/be/src/routes/chat.ts:62-100`, `apps/be/src/routes/generate-title.ts:42-63`, `apps/be/src/lib/env.ts:24-35` |
| C3 | Persistence and shared API contracts evolve from one `user_api_settings` row to multiple saved provider records without breaking existing users | active | `packages/db/src/schema/api-settings.ts:6-17`, `packages/db/drizzle/0003_add_api_settings.sql:1-12`, `packages/shared/src/schemas.ts:139-157` |
| C4 | Model listing and FE model selection support provider-prefixed models and active provider selection | active | `apps/be/src/routes/models.ts:50-202`, `apps/fe/src/components/models/model-selector.tsx:15-233`, `apps/fe/src/app/settings/advanced/page.tsx:37-92` |
| C5 | Chat and title flows preserve current SSE/JSON behavior while using AI SDK internally | active | `apps/be/src/routes/chat.ts:104-460`, `apps/be/src/routes/generate-title.ts:65-212`, `apps/fe/src/components/chat/use-stream-chat.ts:117-271` |
| C6 | Tests, docs, dependencies, and verification prove parity and remove direct `openai` SDK usage | active | `apps/be/package.json:18-31`, `apps/be/src/routes/chat.test.ts:357-434`, `apps/be/src/routes/settings.test.ts:136-375`, `apps/fe/tests/api-contract.test.ts:219-238` |

## Open assumptions (announced defaults)
<!-- Record any default you adopt instead of asking, so the user can veto it at the gate. -->
<!-- assumption | adopted default | rationale | reversible? -->

| assumption | adopted default | rationale | reversible? |
| --- | --- | --- | --- |
| Native providers | OpenAI, Anthropic, Google Gemini first | User asked multi-provider; these are common first-party AI SDK providers and enough to prove architecture | Yes |
| AI Gateway | Not primary in this pass | User chose official + BYOK, not gateway-only; avoiding another auth/routing path reduces scope | Yes |
| SSE protocol | Preserve existing custom `text`/`reasoning`/`finish`/`error`/`file` events | Current FE parser and file post-processing depend on it; provider migration does not require FE `ai/react` conversion | Yes |
| Tests | No real provider API calls | Existing suite uses fake/stub providers; deterministic tests avoid cost/flakiness | Yes |
| Native provider models | Start with configured/static catalogs for native providers; OpenAI-compatible BYOK can call `/models` | Native provider list APIs differ; current `/models` endpoint assumes OpenAI-compatible shape | Yes |

## Findings (cited - path:lines)

- Current code uses raw OpenAI SDK through dynamic `import("openai")` in `OpenAIProvider.stream()` / `complete()`: `apps/be/src/lib/llm/openai-provider.ts:34-57`, `apps/be/src/lib/llm/openai-provider.ts:109-128`.
- Internal abstraction is already clean: `LLMProvider` exposes `stream()` and `complete()` with app-specific chunk/usage types: `apps/be/src/lib/llm/provider.ts:17-31`, `apps/be/src/lib/llm/provider.ts:63-91`.
- Chat provider resolution is duplicated in chat and title routes and currently selects fake provider, env OpenAI key, or single user BYOK row: `apps/be/src/routes/chat.ts:64-100`, `apps/be/src/routes/generate-title.ts:42-63`.
- Current user settings table permits only one row per user via `userId.unique()` and stores one key/endpoint/model: `packages/db/src/schema/api-settings.ts:6-17`.
- Settings API currently validates an endpoint by fetching `${endpoint}/models`, stores encrypted key, and returns only `hasApiKey`, `endpoint`, `selectedModel`: `apps/be/src/routes/settings.ts:47-64`, `apps/be/src/routes/settings.ts:73-82`, `apps/be/src/routes/settings.ts:144-240`.
- Model listing currently requires a user BYOK key and expects OpenAI-compatible `{ data: [{ id }] }`: `apps/be/src/routes/models.ts:54-65`, `apps/be/src/routes/models.ts:84-100`, `apps/be/src/routes/models.ts:165-195`.
- FE advanced settings UI only captures one API key and endpoint: `apps/fe/src/app/settings/advanced/page.tsx:28-92`, `apps/fe/src/app/settings/advanced/page.tsx:130-205`.
- FE model selector consumes a flat model list and auto-selects the first model: `apps/fe/src/components/models/model-selector.tsx:15-28`, `apps/fe/src/components/models/model-selector.tsx:57-62`.
- Client chat hook sends `model: model || "gpt-5-nano"` and manually parses custom SSE events: `apps/fe/src/components/chat/use-stream-chat.ts:117-128`, `apps/fe/src/components/chat/use-stream-chat.ts:154-241`.
- Existing tests cover BYOK resolution and expect OpenAIProvider use to surface invalid-key errors instead of fake text: `apps/be/src/routes/chat.test.ts:357-434`.
- Existing tests cover settings encryption/endpoint validation and FE contract schemas: `apps/be/src/routes/settings.test.ts:136-375`, `apps/fe/tests/api-contract.test.ts:219-238`.
- GitNexus impact for `OpenAIProvider` is MEDIUM, 8 impacted symbols, direct route callers in chat/title.
- GitNexus impact for `LLMProvider` is MEDIUM, 13 impacted symbols, two implementations and route/orchestrator consumers.
- Vercel AI SDK v7 docs support provider-neutral `streamText`/`generateText`, provider registry, `@ai-sdk/openai-compatible`, and typed errors (`NoSuchModelError`, `NoSuchProviderError`, `APICallError`).
- Latest package versions observed: `ai@7.0.22`, `@ai-sdk/openai@4.0.11`, `@ai-sdk/anthropic@4.0.12`, `@ai-sdk/google@4.0.12`, `@ai-sdk/openai-compatible@3.0.7`.

## Decisions (with rationale)

- User chose official AI SDK providers plus OpenAI-compatible BYOK.
- User chose multiple saved provider credentials.
- User chose characterization-first tests.
- Plan will preserve the existing `LLMProvider` and custom SSE protocol in this pass to reduce blast radius.
- Plan will include backward-compatible migration/read path from current single `user_api_settings` data.

## Scope IN

- Backend Vercel AI SDK dependencies and adapter replacing raw OpenAI SDK usage.
- Provider registry/factory for OpenAI, Anthropic, Google, OpenAI-compatible endpoints, fake provider fallback.
- Multi-provider persistence, Drizzle schema/migration, repositories, settings routes, model routes, shared schemas.
- FE advanced settings and model selector changes for multiple saved providers and provider-prefixed models.
- Characterization tests, migration tests, route tests, FE contract tests, docs/env updates, dependency cleanup.

## Scope OUT (Must NOT have)

- Do not switch the frontend to AI SDK `useChat` or AI SDK wire protocol in this pass.
- Do not add AI Gateway as primary routing path.
- Do not make real provider API calls in automated tests.
- Do not remove `FakeLLMProvider` local/test behavior.
- Do not store or return raw API keys in any response/log/SSE event.
- Do not overwrite unrelated untracked `.omo/run-continuation/*.json` files.

## Open questions

None blocking. User decisions captured above.

## Approval gate
status: approved
<!-- When exploration is exhausted and unknowns are answered, set status: awaiting-approval. -->
<!-- That durable record is the loop guard: on a later turn read it and resume at the gate instead of re-running exploration. -->

approved_by_user: yes, user replied "approve"

## Plan output

- Plan written: `.omo/plans/vercel-ai-sdk-multi-provider-implementation.md`
- Mandatory Metis review run and incorporated: preserve custom SSE, make schema/API concrete, include backward-compatible migration, require characterization before provider replacement.
- Delivery status: awaiting user choice: start work or run optional high-accuracy review first.
