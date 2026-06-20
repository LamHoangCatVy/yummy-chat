# BYOK Advanced Settings and Chat Model Dropdown

## TL;DR
> **Summary**: Add encrypted per-user BYOK API settings for OpenAI-compatible endpoints, backend-fetched model lists, and a chat-bar model dropdown that controls the model used for each send while preserving the global provider fallback.
> **Deliverables**:
> - Encrypted `user_api_settings` persistence and migration.
> - Advanced settings API and UI for API key + endpoint.
> - Backend model-list proxy/cache and save-time validation.
> - OpenAI-compatible custom endpoint support in the existing LLM provider path.
> - Chat-bar model selector wired through `useStreamChat` to `/api/v1/chat/stream`.
> - Vitest, Playwright smoke, a11y, visual, and final agent QA evidence.
> **Effort**: Large
> **Parallel**: YES - 5 waves
> **Critical Path**: Task 1 + Task 2 → Task 3 + Task 4 → Task 5 → Task 6 + Task 7 → Task 8

## Context
### Original Request
User wants settings to allow users to configure their own API key (BYOK) and API endpoint as Advanced settings, and wants a chat-bar dropdown so users can choose a model from a list.

### Interview Summary
- Store BYOK API keys persistently per user in encrypted DB storage.
- Support OpenAI-compatible endpoints only.
- Fetch the model list from the configured endpoint through the backend.
- BYOK settings are global user defaults, not per-conversation or per-message credentials.
- Chat-bar model selection is authoritative for chat sends.
- Add automated tests using existing Vitest/Playwright patterns plus agent QA.

### Metis Review (gaps addressed)
- Added dedicated encryption env var + AES-256-GCM requirement.
- Added strict no-key-return/no-key-log/no-key-SSE guardrails.
- Added provider fallback rule: user BYOK if configured, otherwise existing global env provider.
- Added model-list failure UX and 60-second backend cache.
- Added save-time endpoint/key validation through model fetch.
- Added skill model precedence rule: do not expand skill model routing; chat-bar selection controls sends.

## Work Objectives
### Core Objective
Enable each authenticated user to configure BYOK credentials for an OpenAI-compatible endpoint, fetch available models from that endpoint, select a model in the chat composer, and stream chat using that selected model without exposing API keys.

### Deliverables
- DB schema + migration for per-user API settings.
- Encryption utility and env validation for `USER_API_KEY_ENCRYPTION_SECRET`.
- Shared schemas/routes for advanced settings and models.
- Backend settings route, models route, provider resolution refactor, and redaction hardening.
- Frontend Advanced settings page and chat model dropdown.
- Unit/integration/e2e/a11y/visual tests and agent-executed QA evidence.

### Definition of Done (verifiable conditions with commands)
- `npm run check` passes.
- `npm test` passes.
- `npm run smoke:advanced` passes after FE/BE/dev DB are running.
- `npm run test:a11y` passes.
- `npm run test:visual` passes or intentionally updates approved screenshots with evidence.
- Authenticated `GET /api/v1/settings/advanced` never returns `apiKey` or plaintext/masked key value.
- DB inspection in test proves encrypted key value is not equal to plaintext.
- Chat stream test proves selected model is passed to the provider.

### Must Have
- Use existing architecture and patterns: Hono routes, shared `API_V1`, Zod schemas, Drizzle schema, repository/actor scoping, `LLMProvider`, settings layout, and `SkillSelector`-style dropdown.
- Store API key encrypted at rest using AES-256-GCM and a dedicated env secret.
- Fetch models through backend only; never directly from browser using the user's key.
- Validate key/endpoint on save by calling model-list fetch server-side.
- Preserve existing no-BYOK global env fallback.
- Sanitize all key-related data in logs, audit, regular JSON errors, and chat SSE error events.

### Must NOT Have (guardrails, AI slop patterns, scope boundaries)
- MUST NOT store API keys in localStorage, sessionStorage, cookies, or client-visible responses.
- MUST NOT return raw or masked API keys from GET settings.
- MUST NOT support Anthropic/Gemini/provider-specific APIs in this plan.
- MUST NOT add per-conversation/per-message credentials.
- MUST NOT introduce billing/admin dashboard/provider analytics beyond preserving existing usage behavior.
- MUST NOT silently auto-append `/v1` to endpoints; validate and normalize only whitespace/trailing slash.
- MUST NOT rewrite the chat architecture or migrate providers/frameworks unnecessarily.

## Verification Strategy
> ZERO HUMAN INTERVENTION - all verification is agent-executed.
- Test decision: tests-after using existing Vitest + Playwright framework.
- QA policy: Every task has agent-executed scenarios.
- Evidence: `.omo/evidence/task-{N}-{slug}.{ext}`

## Execution Strategy
### Parallel Execution Waves
> Target: 5-8 tasks per wave. <3 per wave (except final) = under-splitting.
> Extract shared dependencies as Wave-1 tasks for max parallelism.

Wave 1: Tasks 1, 2 — DB/shared contracts and encryption/redaction foundations can proceed in parallel.
Wave 2: Tasks 3, 4 — backend settings API and provider baseURL/refactor can proceed after Wave 1.
Wave 3: Task 5 — model-list proxy/cache depends on settings + provider resolution.
Wave 4: Tasks 6, 7 — frontend Advanced settings and chat dropdown build on backend contracts.
Wave 5: Task 8 — cross-feature QA, a11y, visual, and smoke hardening.

### Dependency Matrix (full, all tasks)
| Task | Blocks | Blocked By |
|------|--------|------------|
| 1. DB + shared contracts | 3, 5, 6 | None |
| 2. Encryption + redaction | 3, 4, 5 | None |
| 3. Advanced settings backend | 5, 6 | 1, 2 |
| 4. Provider baseURL + resolution | 5, 7, 8 | 2 |
| 5. Model-list backend proxy | 6, 7, 8 | 1, 2, 3, 4 |
| 6. Advanced settings frontend | 8 | 1, 3, 5 |
| 7. Chat model dropdown | 8 | 4, 5 |
| 8. End-to-end hardening | Final verification | 5, 6, 7 |

### Agent Dispatch Summary (wave → task count → categories)
| Wave | Tasks | Recommended Categories |
|------|-------|------------------------|
| Wave 1 | 2 | unspecified-high |
| Wave 2 | 2 | unspecified-high |
| Wave 3 | 1 | unspecified-high |
| Wave 4 | 2 | visual-engineering, unspecified-high |
| Wave 5 | 1 | unspecified-high + visual QA |

> Note: waves below 3 tasks are intentional here because backend security dependencies are strict. Do not dispatch a task before its `Blocked By` list is complete.

## TODOs
> Implementation + Test = ONE task. Never separate.
> EVERY task MUST have: Agent Profile + Parallelization + QA Scenarios.

- [x] 1. Add per-user API settings schema, migration, and shared contracts

  **What to do**: Add a Drizzle `user_api_settings` table following the per-user pattern from `packages/db/src/schema/memory.ts` `userMemorySettings`: unique `userId`, encrypted API key text, endpoint text, optional selected/default model, timestamps. Export it from `packages/db/src/schema/index.ts`, create a migration, and add shared Zod schemas/types for advanced settings GET/PUT responses and model-list response in `packages/shared/src/schemas.ts`. Add route constants for settings/models in `packages/shared/src/routes.ts` using existing `API_V1` style.
  **Must NOT do**: Do not store plaintext API key. Do not add per-conversation credentials. Do not change existing Better Auth schema.

  **Recommended Agent Profile**:
  - Category: `unspecified-high` - Reason: touches DB schema, migration, shared contracts, and tests.
  - Skills: [] - No special skill needed beyond repo pattern following.
  - Omitted: [`frontend-ui-ux`] - No UI work in this task.

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: 3, 5, 6 | Blocked By: none

  **References** (executor has NO interview context - be exhaustive):
  - Pattern: `packages/db/src/schema/memory.ts` - follow `userMemorySettings` per-user unique settings table style.
  - Pattern: `packages/db/src/schema/index.ts` - export new schema table.
  - Pattern: `packages/shared/src/schemas.ts` - existing `skillSchema`, `sendMessageInputSchema`, and settings-style Zod conventions.
  - Pattern: `packages/shared/src/routes.ts` - add route constants beside `API_V1.MEMORY`, `API_V1.SKILLS`, `API_V1.CHAT`.
  - Test: `packages/shared/src/index.test.ts` - schema validation/exhaustiveness style.
  - Test: `packages/db/src/client.test.ts` - migration/constraint verification pattern.

  **Acceptance Criteria** (agent-executable only):
  - [ ] `npm test --workspace @yummy/shared` passes with schemas covering valid/invalid advanced settings and model-list payloads.
  - [ ] `npm test --workspace @yummy/db` passes and verifies `user_api_settings.user_id` uniqueness/FK behavior.
  - [ ] A DB test confirms the API key column type is `text` or equivalent unbounded storage, not short varchar.

  **QA Scenarios** (MANDATORY - task incomplete without these):
  ```
  Scenario: Schema accepts valid advanced settings payload
    Tool: Bash
    Steps: Run `npm test --workspace @yummy/shared -- --runInBand` or repo-equivalent Vitest command for shared package.
    Expected: Valid endpoint + optional API key payload parses; invalid URL and overlong model values fail.
    Evidence: .omo/evidence/task-1-contracts.txt

  Scenario: DB constraints reject duplicate settings rows
    Tool: Bash
    Steps: Run `npm test --workspace @yummy/db` after migration generation.
    Expected: Second row for same user fails unique constraint; FK rejects unknown user.
    Evidence: .omo/evidence/task-1-db-constraints.txt
  ```

  **Commit**: YES | Message: `feat(settings): add user api settings contracts` | Files: [`packages/db/src/schema/*`, `packages/db/src/migrations/*`, `packages/shared/src/*`]

- [x] 2. Add encryption, env validation, and secret redaction foundations

  **What to do**: Add a backend encryption utility using Node `crypto` AES-256-GCM with a dedicated `USER_API_KEY_ENCRYPTION_SECRET` env var. Require a 32-byte decoded secret or documented base64/hex input; fail fast with safe error if missing when BYOK paths are used. Extend env/example validation and redaction so API key fields, encrypted API key fields, endpoint settings names, and request bodies cannot leak secrets.
  **Must NOT do**: Do not reuse `BETTER_AUTH_SECRET`. Do not log plaintext, masked key, IV, auth tag, or decrypted values. Do not add client-side crypto.

  **Recommended Agent Profile**:
  - Category: `unspecified-high` - Reason: security-sensitive utility and tests.
  - Skills: [] - Existing repo tests are enough.
  - Omitted: [`security-research`] - Full vulnerability audit is reserved for final review, not implementation.

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: 3, 4, 5 | Blocked By: none

  **References**:
  - Pattern: `apps/be/src/lib/env.ts` - env getter/normalization pattern.
  - Pattern: `.env.example` - document required/optional environment values.
  - Pattern: `apps/be/src/lib/redact.ts` and `apps/be/src/lib/redact.test.ts` - existing secret redaction implementation and tests.
  - Pattern: `apps/be/src/lib/audit.ts` / `apps/be/src/lib/audit.test.ts` - audit event safety expectations.

  **Acceptance Criteria**:
  - [ ] Encryption round-trip test passes for realistic API key strings.
  - [ ] Same plaintext encrypts to different ciphertext on repeated calls due to random IV.
  - [ ] Decryption fails safely for tampered ciphertext/tag.
  - [ ] `redact.test.ts` proves `apiKey`, `encryptedApiKey`, `user_api_key`, `authorization`, and advanced settings payloads are redacted.
  - [ ] `.env.example` documents `USER_API_KEY_ENCRYPTION_SECRET` with generation command/instruction.

  **QA Scenarios**:
  ```
  Scenario: Encryption protects key at rest
    Tool: Bash
    Steps: Run backend Vitest file for the encryption utility.
    Expected: Ciphertext does not contain plaintext; decrypt returns original; repeated encryption differs.
    Evidence: .omo/evidence/task-2-encryption.txt

  Scenario: Redaction removes key material from logs
    Tool: Bash
    Steps: Run `npm run test:security --workspace @yummy/be`.
    Expected: All sensitive BYOK fields are replaced by redaction marker in nested objects and URLs.
    Evidence: .omo/evidence/task-2-redaction.txt
  ```

  **Commit**: YES | Message: `feat(security): add encrypted byok secret handling` | Files: [`apps/be/src/lib/*`, `apps/be/src/lib/*.test.ts`, `.env.example`, `scripts/check-env.ts` if applicable]

- [x] 3. Add authenticated Advanced settings backend API

  **What to do**: Add Hono routes for authenticated Advanced settings using shared schemas: `GET /api/v1/settings/advanced` returns non-sensitive settings metadata, and `PUT /api/v1/settings/advanced` validates endpoint/API key, encrypts key, upserts per-user settings, and invalidates model-cache entries. Register routes in `apps/be/src/routes/index.ts`. Use actor/user scoping via session middleware and repository style.
  **Must NOT do**: GET must not return raw key, masked key, encrypted key, IV, tag, or any decryptable material. Do not accept unauthenticated requests.

  **Recommended Agent Profile**:
  - Category: `unspecified-high` - Reason: backend route, repository, auth, encryption, integration tests.
  - Skills: [] - Existing Hono/Vitest patterns are sufficient.
  - Omitted: [`frontend-ui-ux`] - UI comes later.

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: 5, 6 | Blocked By: 1, 2

  **References**:
  - Pattern: `apps/be/src/routes/memory.ts` - authenticated per-user settings route style.
  - Pattern: `apps/be/src/routes/skills.ts` - Zod validation and response envelope style.
  - Pattern: `apps/be/src/routes/index.ts` - router registration.
  - Pattern: `apps/be/src/lib/repositories.ts` - actor-scoped repository factories.
  - Test: `apps/be/src/routes/memory.test.ts` - settings CRUD and auth isolation pattern.
  - Test: `apps/be/src/routes/chat.test.ts` - auth cookie and app.request setup.

  **Acceptance Criteria**:
  - [ ] Unauthenticated GET/PUT returns 401.
  - [ ] PUT with valid endpoint/key stores encrypted DB value and returns success metadata.
  - [ ] GET after PUT returns `hasApiKey: true`, normalized endpoint, selected/default model if present, and no key fields.
  - [ ] PUT with invalid URL returns validation error.
  - [ ] Per-user isolation test proves user B cannot read/update user A settings.

  **QA Scenarios**:
  ```
  Scenario: Authenticated user saves BYOK settings
    Tool: Bash
    Steps: Run backend route test for advanced settings using createTestDatabase and signUpAndSignIn.
    Expected: PUT 200/204 success; DB encrypted value differs from plaintext; GET returns hasApiKey true and no apiKey property.
    Evidence: .omo/evidence/task-3-settings-api.txt

  Scenario: Unauthorized and invalid input fail safely
    Tool: Bash
    Steps: Run tests for unauthenticated requests and invalid endpoint payloads.
    Expected: 401 for no session, VALIDATION_ERROR for bad endpoint, no secret text in error body.
    Evidence: .omo/evidence/task-3-settings-errors.txt
  ```

  **Commit**: YES | Message: `feat(settings): add advanced byok api` | Files: [`apps/be/src/routes/*`, `apps/be/src/lib/repositories.ts`, `apps/be/src/routes/*.test.ts`]

- [x] 4. Refactor provider construction for OpenAI-compatible BYOK endpoint support

  **What to do**: Extend `OpenAIProvider` to accept an optional `baseURL` and preserve the existing default model behavior. Refactor `apps/be/src/routes/chat.ts` provider resolution so it can construct a provider per authenticated request from decrypted user settings when configured, otherwise use the existing global env fallback. Ensure provider instances are request-scoped and never module-level mutable singletons. Apply the redaction utility to chat streaming/SSE error events so provider auth errors cannot expose API keys, authorization headers, encrypted values, or endpoint credential details to the browser.
  **Must NOT do**: Do not migrate to a different provider framework. Do not cache decrypted API keys. Do not change chat behavior for users without BYOK settings. Do not forward raw provider errors directly into SSE `error` events.

  **Recommended Agent Profile**:
  - Category: `unspecified-high` - Reason: backend refactor with backward compatibility risk.
  - Skills: [] - Existing provider tests and route tests are sufficient.
  - Omitted: [`frontend-ui-ux`] - No UI work in this task.

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: 5, 7, 8 | Blocked By: 2

  **References**:
  - Pattern: `apps/be/src/lib/llm/provider.ts` - `LLMProvider`, `StreamRequest`, `StreamChunk` contract.
  - Current target: `apps/be/src/lib/llm/openai-provider.ts` - currently constructs `new OpenAI({ apiKey })` without `baseURL`.
  - Current target: `apps/be/src/routes/chat.ts` - current `getProvider()` reads global env vars and defaults model.
  - Pattern: `apps/be/src/lib/llm/fake-provider.ts` and `fake-provider.test.ts` - provider behavior tests.
  - Test: `apps/be/src/routes/chat.test.ts` - route-level model/provider integration tests.

  **Acceptance Criteria**:
  - [ ] `OpenAIProvider` constructor accepts `apiKey`, optional default model, and optional `baseURL`.
  - [ ] Chat route integration test proves no-BYOK user still uses global fallback and existing default model.
  - [ ] Chat route integration test proves BYOK user settings override global provider key/endpoint.
  - [ ] Test double proves selected model from request reaches provider unchanged.
  - [ ] No decrypted key is stored outside local request scope.
  - [ ] Chat SSE error-event test proves provider errors containing `sk-test-secret`, `Authorization`, or endpoint credential details are redacted before reaching the browser.

  **QA Scenarios**:
  ```
  Scenario: Existing global provider fallback remains intact
    Tool: Bash
    Steps: Run backend chat tests with no user_api_settings row and fake/global provider configuration.
    Expected: Chat stream succeeds with existing default model behavior.
    Evidence: .omo/evidence/task-4-global-fallback.txt

  Scenario: BYOK endpoint overrides provider for user
    Tool: Bash
    Steps: Run backend chat/provider tests with encrypted user settings and selected model.
    Expected: Provider receives decrypted key only inside request, custom baseURL, and selected model.
    Evidence: .omo/evidence/task-4-byok-provider.txt

  Scenario: SSE streaming errors do not leak BYOK secrets
    Tool: Bash
    Steps: Run backend chat SSE test with a fake provider throwing an error containing `sk-test-secret` and `Authorization: Bearer sk-test-secret`.
    Expected: SSE `error` event reaches client with safe generic/redacted message and no raw key, auth header, encrypted value, IV, tag, or endpoint credential detail.
    Evidence: .omo/evidence/task-4-sse-redaction.txt
  ```

  **Commit**: YES | Message: `feat(llm): support byok endpoint provider resolution` | Files: [`apps/be/src/lib/llm/*`, `apps/be/src/routes/chat.ts`, `apps/be/src/routes/chat.test.ts`]

- [x] 5. Add backend model-list proxy, cache, and save-time validation

  **What to do**: Add authenticated `GET /api/v1/models` endpoint that resolves the active user provider settings, calls the configured OpenAI-compatible `/models` endpoint server-side, normalizes returned model IDs for the frontend, and caches results for 60 seconds per user/settings fingerprint. Wire Advanced settings PUT to validate by fetching models before committing key/endpoint or to commit only when validation succeeds. Invalidate cache after successful settings update.
  **Must NOT do**: Do not call provider endpoints from the browser. Do not return API key or provider authorization errors containing secrets. Do not implement provider-specific non-OpenAI model APIs.

  **Recommended Agent Profile**:
  - Category: `unspecified-high` - Reason: backend networking, cache, validation, failure handling, integration tests.
  - Skills: [] - Existing route/test patterns are sufficient.
  - Omitted: [`security-research`] - Security review happens in final verification.

  **Parallelization**: Can Parallel: YES | Wave 3 | Blocks: 6, 7, 8 | Blocked By: 1, 2, 3, 4

  **References**:
  - Pattern: `apps/be/src/routes/chat.ts` - authenticated streaming route and error envelope style.
  - Pattern: `packages/shared/src/response.ts` and `packages/shared/src/errors.ts` - success/error response shapes.
  - Pattern: `apps/be/src/routes/*.test.ts` - Hono `app.request` integration test style.
  - External: OpenAI-compatible providers usually expose `GET {baseURL}/models`; validate only OpenAI-compatible response shapes with `data[].id`.

  **Acceptance Criteria**:
  - [ ] Authenticated GET models returns normalized `models: [{ id, label? }]` from mocked OpenAI-compatible endpoint.
  - [ ] Invalid/unauthorized endpoint returns safe actionable error with no key/endpoint credential details.
  - [ ] Cache test proves repeated GET within 60 seconds avoids duplicate endpoint fetch.
  - [ ] Successful settings PUT invalidates old model cache.
  - [ ] Save-time validation rejects endpoint/key combinations that cannot fetch a valid model list.

  **QA Scenarios**:
  ```
  Scenario: Model list proxy returns endpoint models
    Tool: Bash
    Steps: Run backend models route test with mocked fetch returning `{ data: [{ id: "gpt-4o" }] }`.
    Expected: Response has `models[0].id === "gpt-4o"`; no secret fields exist.
    Evidence: .omo/evidence/task-5-models-proxy.txt

  Scenario: Bad endpoint fails without leakage
    Tool: Bash
    Steps: Run backend models/settings tests for 401/500/bad-shape endpoint responses.
    Expected: User gets safe validation/fetch error; API key string does not appear in response or logs.
    Evidence: .omo/evidence/task-5-models-errors.txt
  ```

  **Commit**: YES | Message: `feat(models): add byok model list proxy` | Files: [`apps/be/src/routes/*`, `apps/be/src/lib/*`, `packages/shared/src/*`]

- [x] 6. Build Advanced settings frontend page and API client wiring

  **What to do**: Add `/settings/advanced` page under the existing settings layout and add an Advanced nav item in `settings-nav.tsx`. Add typed FE API client functions to load/save advanced settings and fetch models. Build a form with API key password input, endpoint URL input, validation/save state, success/error messaging, and a “key already configured” indicator based only on `hasApiKey`. On save, call backend PUT and display model validation result.
  **Must NOT do**: Do not prefill API key with raw/masked server value. Do not persist key in browser storage. Do not expose provider error details that include secrets.

  **Recommended Agent Profile**:
  - Category: `visual-engineering` - Reason: frontend form, navigation, accessible settings UX.
  - Skills: [`frontend-ui-ux`] - Use existing UI patterns and avoid generic layout regressions.
  - Omitted: [`playwright`] - Playwright scenarios are included but not a browser automation task itself.

  **Parallelization**: Can Parallel: YES | Wave 4 | Blocks: 8 | Blocked By: 1, 3, 5

  **References**:
  - Pattern: `apps/fe/src/app/settings/layout.tsx` - settings shell and auth guard.
  - Pattern: `apps/fe/src/app/settings/settings-nav.tsx` - nav item structure.
  - Pattern: `apps/fe/src/components/memory/memory-manager.tsx` - settings state, toggles, save UX.
  - Pattern: `apps/fe/src/components/skills/skills-manager.tsx` - form fields, validation errors, save/cancel style.
  - Pattern: `apps/fe/src/lib/api.ts` - typed `fetchApi` and Zod response parsing.
  - Test: `apps/fe/tests/api-contract.test.ts` - FE API client contract testing.
  - Test: `apps/fe/tests/e2e/advanced-smoke.spec.ts` - settings navigation and interaction smoke pattern.

  **Acceptance Criteria**:
  - [ ] `/settings/advanced` requires session via existing settings layout.
  - [ ] Settings nav includes Advanced item and active state works.
  - [ ] Existing configured key displays as “API key configured” without showing key value.
  - [ ] Saving valid endpoint/key shows success and model validation result.
  - [ ] Invalid endpoint/save error shows actionable message.
  - [ ] FE contract tests cover new API client functions and error envelopes.

  **QA Scenarios**:
  ```
  Scenario: User saves Advanced BYOK settings
    Tool: Playwright
    Steps: Login as seeded test user, navigate to `/settings/advanced`, fill API Key `sk-test123`, fill endpoint `https://api.openai.com/v1`, click Save.
    Expected: Success message appears; page indicates key configured; API key input value is empty after reload.
    Evidence: .omo/evidence/task-6-advanced-settings.png

  Scenario: Invalid endpoint shows accessible error
    Tool: Playwright
    Steps: Navigate to `/settings/advanced`, enter endpoint `not-a-url`, click Save.
    Expected: Save is rejected with visible error text associated with endpoint field; no navigation occurs.
    Evidence: .omo/evidence/task-6-advanced-settings-error.png
  ```

  **Commit**: YES | Message: `feat(settings): add advanced byok page` | Files: [`apps/fe/src/app/settings/*`, `apps/fe/src/components/*`, `apps/fe/src/lib/api.ts`, `apps/fe/tests/*`]

- [x] 7. Add chat-bar model dropdown and wire selected model through chat sends

  **What to do**: Add a `ModelSelector` component following the interaction style of `SkillSelector`, place it in `ChatComposer` alongside the existing skill selector, and update `ChatContainer`/`useStreamChat` so `sendMessage` accepts the selected model instead of hardcoding `"gpt-5-nano"`. Load models from `GET /api/v1/models`, show loading/error/empty states, retain selected/default model on fetch failure, and make the dropdown keyboard accessible.
  **Must NOT do**: Do not remove the existing skill selector. Do not let skill `model` silently override the chat-bar model. Do not fetch provider models directly from the browser endpoint.

  **Recommended Agent Profile**:
  - Category: `visual-engineering` - Reason: chat composer layout and accessible dropdown UI.
  - Skills: [`frontend-ui-ux`] - Must preserve composer quality and responsive behavior.
  - Omitted: [`security-research`] - No security audit here; final review covers it.

  **Parallelization**: Can Parallel: YES | Wave 4 | Blocks: 8 | Blocked By: 4, 5

  **References**:
  - Pattern: `apps/fe/src/components/skills/skill-selector.tsx` - dropdown behavior, loading/error/empty states, clear/select style.
  - Current target: `apps/fe/src/components/chat/chat-composer.tsx` - composer layout currently embeds `SkillSelector`.
  - Current target: `apps/fe/src/components/chat/chat-container.tsx` - `handleSend` currently passes content/conversation/skill.
  - Current target: `apps/fe/src/components/chat/use-stream-chat.ts` - hardcoded `model: "gpt-5-nano"` to replace.
  - Type target: `apps/fe/src/components/chat/types.ts` - update local types only if needed.
  - Test: `apps/fe/tests/e2e/core-smoke.spec.ts` and `advanced-smoke.spec.ts` - chat send smoke patterns.

  **Acceptance Criteria**:
  - [ ] Chat composer shows a model selector with accessible name `Model`.
  - [ ] Selector fetches models from FE API client/backend route and displays model IDs.
  - [ ] Selecting a model updates state and subsequent send body includes that model.
  - [ ] If models fetch fails, UI shows safe error and keeps current/default selected model.
  - [ ] Existing skill selection and send/stop behavior still works.
  - [ ] Keyboard open/navigate/select works in Playwright.

  **QA Scenarios**:
  ```
  Scenario: User selects model and sends chat
    Tool: Playwright
    Steps: Login, open `/chat`, open Model dropdown, select `gpt-4o` from mocked/seeded list, type `hello`, click Send.
    Expected: User message appears, assistant response streams, backend test/evidence confirms request model is `gpt-4o`.
    Evidence: .omo/evidence/task-7-model-send.png

  Scenario: Model endpoint fails gracefully
    Tool: Playwright
    Steps: Force `/api/v1/models` failure via test route/mock, open `/chat`, open Model dropdown.
    Expected: Safe error is visible, no API key/endpoint details shown, send remains possible with retained default model if configured.
    Evidence: .omo/evidence/task-7-model-fetch-error.png
  ```

  **Commit**: YES | Message: `feat(chat): add model selector to composer` | Files: [`apps/fe/src/components/chat/*`, `apps/fe/src/components/models/*`, `apps/fe/src/lib/api.ts`, `apps/fe/tests/*`]

- [x] 8. Add cross-feature e2e, a11y, visual, and regression hardening

  **What to do**: Extend automated coverage to verify the complete BYOK flow: configure Advanced settings, fetch models, select model in chat, send message, and verify selected model reaches provider. Add or update Playwright advanced smoke, settings a11y, settings visual, FE API contract, BE chat route, and redaction tests as needed. Capture evidence files under `.omo/evidence/` for both happy and failure paths.
  **Must NOT do**: Do not fake success without exercising UI and backend together where possible. Do not mark visual changes accepted without screenshot evidence. Do not skip no-BYOK fallback regression.

  **Recommended Agent Profile**:
  - Category: `unspecified-high` - Reason: cross-layer verification, regression hardening, evidence collection.
  - Skills: [`playwright`, `visual-qa`] - Browser verification and visual/a11y evidence are required.
  - Omitted: [`git-master`] - Commit flow is optional and separate.

  **Parallelization**: Can Parallel: NO | Wave 5 | Blocks: Final verification | Blocked By: 5, 6, 7

  **References**:
  - Test: `apps/be/src/routes/chat.test.ts` - streaming/auth/model route integration pattern.
  - Test: `apps/be/src/routes/memory.test.ts` - user settings isolation pattern.
  - Test: `apps/fe/tests/e2e/advanced-smoke.spec.ts` - advanced settings and chat flow pattern.
  - Test: `apps/fe/tests/a11y/settings-a11y.spec.ts` - settings a11y pattern.
  - Test: `apps/fe/tests/visual/settings-visual.spec.ts` - settings screenshot pattern.
  - Test: `apps/fe/tests/api-contract.test.ts` - FE API contract pattern.
  - Command: `npm run check`, `npm test`, `npm run smoke:advanced`, `npm run test:a11y`, `npm run test:visual`.

  **Acceptance Criteria**:
  - [ ] Backend route tests cover encrypted settings, model proxy, BYOK provider selection, and global fallback.
  - [ ] Backend chat streaming tests cover SSE provider-error redaction with secret-containing fake errors.
  - [ ] FE contract tests cover Advanced settings and models API clients.
  - [ ] Playwright advanced smoke covers save settings → model dropdown → send chat.
  - [ ] A11y test covers `/settings/advanced` with no serious/critical violations.
  - [ ] Visual test covers `/settings/advanced` and chat composer with model dropdown.
  - [ ] `npm run check` and `npm test` pass.
  - [ ] Evidence files are saved under `.omo/evidence/` for happy path and failure path.

  **QA Scenarios**:
  ```
  Scenario: Full BYOK model selection journey
    Tool: Playwright
    Steps: Start dev stack, login as seeded user, save Advanced settings, open chat, select fetched model, send `Use the selected model`, wait for assistant response.
    Expected: UI shows configured key indicator, model dropdown selection, assistant response; backend evidence confirms selected model used.
    Evidence: .omo/evidence/task-8-full-byok-journey.png

  Scenario: Regression without BYOK settings
    Tool: Bash + Playwright
    Steps: Use a user with no `user_api_settings`; run backend chat tests and Playwright core smoke.
    Expected: Existing global env/fake provider chat flow still works with no Advanced settings configured.
    Evidence: .omo/evidence/task-8-global-fallback-regression.txt
  ```

  **Commit**: YES | Message: `test(byok): cover advanced settings model routing` | Files: [`apps/be/src/**/*.test.ts`, `apps/fe/tests/**`, `.omo/evidence/*`]

## Final Verification Wave (MANDATORY — after ALL implementation tasks)
> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.
> **Do NOT auto-proceed after verification. Wait for user's explicit approval before marking work complete.**
> **Never mark F1-F4 as checked before getting user's okay.** Rejection or user feedback -> fix -> re-run -> present again -> wait for okay.
- [x] F1. Plan Compliance Audit — oracle
- [x] F2. Code Quality Review — unspecified-high
- [x] F3. Real Manual QA — unspecified-high (+ playwright)
- [x] F4. Scope Fidelity Check — deep

## Commit Strategy
- Commit after each completed wave if repository policy allows.
- Suggested commits:
  - `feat(settings): add encrypted user api settings contracts`
  - `feat(llm): support byok endpoint model routing`
  - `feat(chat): add advanced settings and model selector`
  - `test(byok): cover model routing and advanced settings qa`

## Success Criteria
- Users can configure API key and endpoint under Advanced settings.
- API key is encrypted at rest and never returned in settings responses.
- Model list is fetched server-side from the configured OpenAI-compatible endpoint.
- Chat composer includes an accessible model dropdown.
- Selected model is sent to backend and used by the provider.
- Existing global env provider flow still works for users without BYOK settings.
- Automated and agent-executed QA evidence exists for happy paths and failure paths.
