# ADD.md — Changes Since Initial Push (`0aa3094`)

## 1. Backend Dev Startup Fix

**Problem**: `tsx watch` didn't load root `.env`, so `BETTER_AUTH_URL` was missing → backend crashed before opening port → FE proxy got `ECONNREFUSED`.

| File | Change |
|------|--------|
| `apps/be/package.json` | `dev` script: `node --env-file-if-exists=../../.env ../../node_modules/tsx/dist/cli.mjs watch src/index.ts` |

---

## 2. UI Styling Fix — Tailwind Design Tokens

**Problem**: `globals.css` defined `--color-*` and `--font-*` but NO `--spacing-*` or `--radius-*` tokens. Every `px-spacing-3`, `gap-spacing-2`, `rounded-radius-md` in 10 components did nothing → no padding, no margins, no border-radius → unstyled raw UI.

| File | Change |
|------|--------|
| `apps/fe/src/app/globals.css` | Added 12 spacing tokens (`--spacing-spacing-*`) and 5 radius tokens (`--radius-radius-*`) per DESIGN.md §4. Added `.prose-chat` markdown styles. |
| `apps/fe/src/components/memory/memory-manager.tsx` | `py-spacing-0.5` → `py-spacing-half` (Biome CSS parser issue with `.5`) |
| `apps/fe/src/components/memory/memory-panel.tsx` | Same |
| `apps/fe/src/app/chat/chat-sidebar-client.tsx` | `gap-spacing-0.5` → `gap-spacing-half` |

---

## 3. API Contract Mismatches

**Problem**: Backend response shapes didn't match FE Zod schemas, causing raw JSON error dumps in the UI.

### 3a. Conversations List

| File | Change |
|------|--------|
| `packages/shared/src/schemas.ts` | `conversationListResponseSchema`: `{ conversations, total }` → `{ conversations, nextCursor }` |
| `apps/be/src/routes/conversations.ts` | GET handler transforms `PaginatedResult` → `data: { conversations, nextCursor }` |
| `apps/be/src/routes/conversations.test.ts` | Updated assertions: `body.data.data` → `body.data.conversations` |
| `apps/fe/tests/api-contract.test.ts` | Updated list response contract test |

### 3b. Skills List

| File | Change |
|------|--------|
| `apps/be/src/routes/skills.ts` | GET handler wraps `rows` → `data: { skills: rows }` |
| `apps/be/src/routes/skills.test.ts` | Updated assertions: `body.data` → `body.data.skills` |

### 3c. Better Auth User ID Format

**Problem**: `userIdSchema = z.string().uuid()` rejected Better Auth's default nanoid-style IDs (`YAUT0yg4k651uTM0figQ2dBaBMyhRyEd`), breaking conversation/skill/memory creation.

| File | Change |
|------|--------|
| `packages/shared/src/schemas.ts` | `userIdSchema`: `z.string().uuid()` → `z.string().min(1)` |
| `apps/be/src/lib/auth.ts` | `generateId: "uuid"` → `generateId: () => crypto.randomUUID()` |
| `packages/shared/src/index.test.ts` | Updated `userIdSchema` test to accept non-UUID |

### 3d. Null vs Optional in DB Fields

**Problem**: DB columns `temperature`, `maxTokens`, `parentId`, `metadata` are nullable (no `.notNull()`), so Drizzle returns `null`. Zod `.optional()` only allows `undefined` — rejected `null` values.

| File | Change |
|------|--------|
| `packages/shared/src/schemas.ts` | `skillSchema.temperature/maxTokens`: `.optional()` → `.nullish()` |
| `packages/shared/src/schemas.ts` | `chatMessageSchema.parentId/metadata`: `.optional()` → `.nullish()` |

---

## 4. Error Display — No Raw Zod JSON in UI

**Problem**: `fetchApi` used `schema.parse()` which throws raw Zod issue JSON as `err.message`, displayed directly in `ErrorState`.

| File | Change |
|------|--------|
| `apps/fe/src/lib/api.ts` | `schema.parse()` → `schema.safeParse()` + friendly `ApiError("Received an unexpected response...")`. Raw Zod issues logged to console only. |

---

## 5. OpenAI Provider (New Feature)

**Problem**: Only a fake LLM provider existed (`FakeLLMProvider`). No real AI responses.

| File | Change |
|------|--------|
| `apps/be/src/lib/llm/openai-provider.ts` | **NEW** — `OpenAIProvider` implementing `LLMProvider` with streaming, abort, and usage tracking |
| `apps/be/src/lib/env.ts` | Added `openaiApiKey` and `openaiModel` (default `gpt-5-nano`) |
| `apps/be/src/routes/chat.ts` | `getProvider()`: uses `OpenAIProvider` when `OPENAI_API_KEY` is set, falls back to `FakeLLMProvider`. Default model `gpt-5-nano`. |
| `apps/fe/src/components/chat/use-stream-chat.ts` | Model: `"fake-provider"` → `"gpt-5-nano"` |
| `.env.example` | Added `OPENAI_API_KEY=""` and `OPENAI_MODEL="gpt-5-nano"` |
| `apps/be/tsconfig.json` | Removed invalid `ignoreDeprecations: "6.0"` (TS 5.9 incompatibility) |
| `apps/be/package.json` | `openai@6.44.0` installed |

---

## 6. Skills Wiring (New Feature)

**Problem**: Skill selector saved the skill to the conversation, but the chat request never sent `skillId`, and the backend didn't auto-load the stored skill.

| File | Change |
|------|--------|
| `apps/fe/src/components/chat/use-stream-chat.ts` | `sendMessage` accepts `skillId` and includes it in POST body |
| `apps/fe/src/components/chat/chat-container.tsx` | Passes `selectedSkillId` to `sendMessage` |
| `apps/be/src/routes/chat.ts` | Auto-loads conversation skill snapshot when no `skillId` in request |

---

## 7. Markdown Rendering (New Feature)

**Problem**: Assistant responses rendered as plain text with `whitespace-pre-wrap`. No formatting.

| File | Change |
|------|--------|
| `apps/fe/src/components/chat/chat-transcript.tsx` | Assistant messages render via `react-markdown` + `remark-gfm`. Strips `xlsx-json` code blocks from display. Added `FileDownloads` component. |
| `apps/fe/src/app/globals.css` | Added `.prose-chat` markdown styles (h1–h3, code, pre, table, blockquote, lists, links, hr) |
| `apps/fe/package.json` | `react-markdown`, `remark-gfm` installed |

---

## 8. XLSX File Generation + Download (New Feature)

**Problem**: No infrastructure to generate downloadable files from LLM output (e.g., BRD → xlsx).

| File | Change |
|------|--------|
| `apps/be/src/lib/llm/xlsx-generator.ts` | **NEW** — Parses `` ```xlsx-json `...` ``` `` code blocks from LLM output, generates `.xlsx` via exceljs |
| `apps/be/src/routes/files.ts` | **NEW** — `GET /api/v1/files/:id` download endpoint |
| `apps/be/src/routes/chat.ts` | After streaming, scans for `xlsx-json`, generates file, sends `file` SSE event |
| `apps/be/src/routes/index.ts` | Mounted `filesRouter` at `API_V1.FILES` |
| `packages/shared/src/routes.ts` | Added `FILES: "/api/v1/files"` to `API_V1` |
| `apps/fe/src/components/chat/types.ts` | Added `FileAttachment` interface, `files` field on `ChatMessage` |
| `apps/fe/src/components/chat/use-stream-chat.ts` | Handles `file` SSE events — stores file metadata on message |
| `apps/fe/src/components/chat/chat-transcript.tsx` | Renders download buttons with `Download` icon for file attachments |
| `packages/shared/src/index.test.ts` | Updated `API_V1` test to include `FILES` |
| `apps/be/package.json` | `exceljs` installed |

---

## 9. TypeScript Config Fix (Pre-existing)

| File | Change |
|------|--------|
| `apps/be/tsconfig.json` | Removed `ignoreDeprecations: "6.0"` — invalid with TS 5.9 |

---

## Gate Status (Final)

| Package | Typecheck | Lint | Tests |
|---------|-----------|------|-------|
| `@yummy/shared` | — | — | 39/39 ✓ |
| `@yummy/be` | ✓ | ✓ | 158/158 ✓ |
| `@yummy/fe` | ✓ | ✓ | 30/30 ✓ |

---

## New Dependencies

| Package | Workspace | Version |
|---------|-----------|---------|
| `openai` | `@yummy/be` | 6.44.0 |
| `exceljs` | `@yummy/be` | latest |
| `react-markdown` | `@yummy/fe` | latest |
| `remark-gfm` | `@yummy/fe` | latest |

---

## Browser QA

Verified at 375px (mobile), 768px (tablet), 1280px (desktop):
- ✅ Tailwind tokens apply (spacing, radius, colors)
- ✅ No raw Zod JSON errors in UI
- ✅ Conversations load and create correctly
- ✅ Skills load and wire to chat requests
- ✅ Markdown renders in assistant messages
- ✅ OpenAI `gpt-5-nano` streams real responses via SSE
- ✅ Console: 0 errors
