# BYOK + Advanced Settings Model Dropdown — Learnings

## Implementation Summary (2026-06-20)

### Changes Made

1. **`apps/be/src/lib/llm/openai-provider.ts`**: Extended `OpenAIProvider` constructor with optional `baseURL?: string` parameter (3rd argument). Passed to `new OpenAI({ apiKey, ...(baseURL ? { baseURL } : {}) })` in `stream()`. Backward-compatible.

2. **`apps/be/src/routes/chat.ts`**:
   - Added imports: `eq`, `db`, `userApiSettings`, `decrypt`, `redact`
   - Created `resolveProviderForUser(userId)` — queries `user_api_settings`, decrypts key if BYOK configured, returns `OpenAIProvider` with user settings; otherwise falls back to `getProvider()`
   - Added null guard for `c.get("user")` before provider resolution
   - Applied `redact()` to all SSE error event data payloads (3 locations)

3. **`apps/be/src/routes/chat.test.ts`**: Added 8 new tests across 2 describe blocks:
   - BYOK provider resolution: no-BYOK fallback, BYOK with encrypted settings
   - SSE error redaction: unit tests on redact(), integration test on SSE stream with sensitive key

### Key Design Decisions

- **Request-scoped**: `resolveProviderForUser` called per-request, new provider each time
- **No key caching**: Decrypted key passed to constructor then GC'd
- **DB in tests**: Used local `drizzle(testDatabase.sql, { schema })` to avoid eager `@yummy/db` client init

### Known Quirks

- **drizzle-orm version mismatch (LSP only)**: Root vs packages/db copies — runtime passes fine
- **redact() anchored regex**: Won't catch embedded secrets in composite strings — future enhancement area

## Frontend Advanced Settings (2026-06-20)

- `apps/fe/src/app/settings/advanced/page.tsx` is client-only so API keys never pass through a server component. It uses `fetchApi` directly, keeps the password input empty after load/save, and only shows a boolean “API key configured” indicator.
- Advanced settings UI follows existing settings tokens and patterns from `SkillsManager`/`MemoryManager`: `bg-surface-*`, `text-text-*`, `spacing-*`, `rounded-radius-*`, muted status banners, and the same compact form controls.
- `apps/fe/src/lib/api.ts` now exports `fetchApi` plus `getAdvancedSettings`, `updateAdvancedSettings`, and `fetchModels`; advanced update validates input with `advancedSettingsPutInputSchema` before sending.
- FE contract tests mock `globalThis.fetch` for `/api/v1/settings/advanced` and `/api/v1/models`, asserting URLs, PUT body, schema parsing, and `ApiError` propagation.

## Frontend Model Selector Wiring (2026-06-20)

- `apps/fe/src/lib/api.ts` did not yet expose `fetchModels()`, so `ModelSelector` calls same-origin `GET /api/v1/models` directly via `API_V1.MODELS` and validates the unwrapped `data` payload with `modelListResponseSchema`.
- Composer state keeps chat-bar model selection independent from skill selection; `sendMessage(content, conversationId, selectedSkillId, selectedModel)` ensures a skill's saved `model` field cannot override the explicit dropdown choice.
- `useStreamChat` now falls back at request time with `model: model || "gpt-5-nano"`, so an empty model list still preserves the previous hardcoded default behavior.

## Cross-Feature E2E Hardening (2026-06-20)

### Tests Added

1. **`apps/fe/tests/e2e/advanced-smoke.spec.ts`** — New `"Advanced smoke: BYOK flow"` describe block:
   - `"BYOK advanced settings and model selection flow"`: Full journey from login → `/settings/advanced` → fill API key + endpoint → save → verify success → `/chat` → verify model combobox → open dropdown → verify listbox content → send message. Test gracefully handles loading/error/"No models available" states.

2. **`apps/fe/tests/a11y/settings-a11y.spec.ts`** — New test:
   - `"advanced settings page has no serious/critical a11y violations"`: Axe scan on `/settings/advanced`

3. **`apps/fe/tests/visual/settings-visual.spec.ts`** — Two new tests:
   - `"advanced settings matches snapshot"`: Full-page screenshot of `/settings/advanced`
   - `"chat composer with model dropdown matches snapshot"`: Full-page screenshot with model dropdown open

### Backend Regression Verification
- `npm test --workspace @yummy/be`: **209 tests, 14 files, all PASSED**
- BYOK provider resolution, SSE redaction, global fallback — all verified
- Evidence saved: `.omo/evidence/task-8-global-fallback-regression.txt`

### Test Selectors Used
- Advanced settings: `#advanced-api-key`, `#advanced-endpoint`, heading "Advanced", save button, "Settings saved" text
- Model selector: `role="combobox"` with `name="Model"`, `role="listbox"` with `name="Available models"`, `role="option"` items
- Chat composer: `role="textbox"` with `name=/message/i`
