
## 2025-06-21 — Task 1: Shared PPTX contracts + pptxgenjs dependency

- Added PPTX/file-generation constants, Zod schemas, and inferred types to `packages/shared/src/schemas.ts`
- Constants: `PPTX_MIME_TYPE`, `GENERATED_FILE_MAX_BYTES`, `PPTX_LIMITS`
- Schemas: `fileAttachmentSchema`, `pptxSlideSchema`, `pptxJsonDataSchema` (all with `.strict()` to reject unknown properties)
- Types: `FileAttachment`, `PptxSlideData`, `PptxJsonData`
- All schemas and types re-exported from `packages/shared/src/index.ts`
- `apps/be/package.json`: added `"pptxgenjs": "^4.0.1"` — installed via `npm install` (lockfile confirmed)
- Pre-existing bug fix: added missing `memoryListResponseSchema` import in `apps/fe/tests/api-contract.test.ts`
- TypeScript note: `as const` cannot be applied to computed expressions (`10 * 1024 * 1024`); removed `as const` from `GENERATED_FILE_MAX_BYTES`
- All 58 tests pass (20 PPTX-specific), all 4 packages pass typecheck
- 25 contract tests added covering: valid parse, empty/missing fields, length constraints (100/120/180/200/240 char limits), min/max array sizes (0, 1, 8, 9), strict mode rejection of unknown properties, and constant value assertions

## 2025-06-21 — Task 2: Durable generated-file DB table and owner-scoped repository

- Created `packages/db/src/schema/generated-files.ts` with `bytea` customType for binary content and `generatedChatFile` table
- `bytea` customType: `customType<{ data: Buffer; driverData: Buffer }>({ dataType() { return "bytea" } })` — maps JS Buffer to PG bytea
- Table: `generated_chat_file` with FK cascades on user_id, conversation_id, message_id
- Added barrel export to `packages/db/src/schema/index.ts`
- Created `packages/db/drizzle/0004_add_generated_chat_file.sql` migration following `--> statement-breakpoint` style with ALTER TABLE FK constraints
- CRITICAL: Updated `packages/db/drizzle/meta/_journal.json` with migration entry (idx:4, tag, breakpoints). Without this, Drizzle migrator skips the SQL file silently.
- Added `generatedFileRepository(actor)` to `apps/be/src/lib/repositories.ts` with owner-scoped `create()` and `getById()`
- `getById()` uses `and(eq(id), eq(userId, actor.userId))` — different actor returns undefined
- Created `apps/be/src/lib/generated-files.test.ts` (9 tests): insert/read, cross-user isolation (2 actors), cascade on conversation delete, cascade on user delete, nullable message_id
- Dynamic import order matters: `createTestDatabase()` must set DATABASE_URL BEFORE `await import("./repositories")` because `@yummy/db` reads env at module init
- All 9 tests pass, migration applied successfully to dev DB

## 2026-06-21 — Task 6: FE history file attachments + generated JSON stripping

- Added FE chat-history tests before implementation; initial failure was the missing `chat-transcript-helpers` module.
- `MessageListItem` now accepts optional nullable `metadata` and exports `messageListItemSchema` for contract tests.
- History mapping is centralized in `mapMessageListItemToChatMessage()`: valid `metadata.files` entries reconstruct `files`, while malformed entries are ignored silently.
- `stripGeneratedJsonBlocks()` removes both `xlsx-json` and `pptx-json` fenced payloads while preserving visible text outside those generated blocks.

## 2025-06-21 — Task 3: PPTX generator (extract + generate)

- Created `apps/be/src/lib/llm/pptx-generator.ts` with two exports:
  - `extractPptxJson(text: string): PptxJsonData | null` — regex extraction of fenced `pptx-json` blocks + JSON.parse + `pptxJsonDataSchema.safeParse()` from `@yummy/shared`. Returns `null` when missing, malformed, or invalid (never throws).
  - `generatePptxBuffer(data: PptxJsonData): Promise<{ filename, mimeType, byteSize, buffer }>` — dynamic ESM import of `pptxgenjs`, builds title slide (title + subtitle on same slide), content slides with bullets, closing slide, generates `nodebuffer`, checks `GENERATED_FILE_MAX_BYTES` (10MB), returns metadata.
- Dynamic import pattern: `const PptxGenJS = (await import("pptxgenjs")).default` — ESM-compatible, one fresh PptxGenJS instance per call.
- Hex colors without `#` prefix: `"333333"`, `"2B579A"`, `"999999"` — pptxgenjs corrupts output when `#` is included.
- Fresh options objects per slide (`.map()` inside loop) — never reuse mutable objects to avoid cross-slide state bleeding.
- `addText` signature: single string + options for titles; array of `{text, options}` objects for bullet runs.
- Layout: `pptx.layout = "LAYOUT_WIDE"` (16:9).
- Buffer size guard: `if (buffer.length > GENERATED_FILE_MAX_BYTES) throw new Error("PPTX_FILE_TOO_LARGE")`.
- Created `apps/be/src/lib/llm/pptx-generator.test.ts` (11 tests):
  - extractPptxJson: valid parse, no block returns null, malformed JSON returns null, 9 slides rejected, 9 bullets / 181-char bullet / unknown property rejected, title >120 chars rejected, empty title/slides rejected
  - generatePptxBuffer: ZIP magic bytes (PK), correct metadata shape, slide/addText call counts, oversized buffer throws
- All 11 tests pass. Vitest mock used for pptxgenjs (controls write buffer size for oversized test; addSlide/addText calls verified via mock counters).
- LSP diagnostics clean on both files.

## 2025-06-21 — Task 4: DB-backed file download route + tests

- Replaced `apps/be/src/routes/files.ts` temp-dir file serving with DB lookup via `generatedFileRepository(actor)`
- Removed all `node:fs`, `node:os`, `node:path` imports — no temp file reading remains
- Route now: validates UUID → creates actor from session user → queries `getById(id)` (owner-scoped) → returns binary response with correct headers or 404
- `NotFoundError` requires `resource` field per `YummyError` union type (e.g., `resource: "file"`)
- `Actor` type is `{ readonly userId: UserId }` — requires `as UserId` cast from session user id string
- `Buffer` is not assignable to `BodyInit` in Hono's `new Response()` — use `new Uint8Array(buffer)` wrapper
- Tests (`apps/be/src/routes/files.test.ts`): 5 cases — unauthenticated (401), invalid UUID (404), owner download (200 + correct headers/bytes), wrong owner (404), valid owner match (200)
- Test auth pattern: `signUpAndSignIn()` via `app.request("/api/v1/auth/sign-up/email")` + `app.request("/api/v1/auth/sign-in/email")`, extract cookies via `getSetCookie()`
- Test data seeded with raw SQL via `testSql` from `createTestDatabase(import.meta.url)`
- Wrong owner always returns 404 to prevent file existence leakage (not 403)
- All 5 route tests pass, `tsc --noEmit` clean

## 2026-06-21 — Task 5: Chat persistence refactor + PPTX/XLSX integration

### messageRepository.update()
- Added `update(id, data)` to `messageRepository(conversationId)` in `repositories.ts`
- Updates `content` and/or `metadata`, always sets `updatedAt` to current date
- Where clause includes both `eq(message.id, id)` and `eq(message.conversationId, conversationId)` for conversation-scoped safety
- Returns the updated row or `undefined` if no match

### Chat route refactoring (finally block)
- **Before**: `finally` created a SECOND completed message row (duplicate), then generated XLSX to temp file with no DB persistence
- **After**: `finally` generates PPTX + XLSX FIRST (persisting to `generatedChatFile` table), then UPDATES the existing placeholder message via `msgRepo.update(assistantMsgId, ...)` with accumulated text + `metadata.files` array
- File metadata shape: `{ id, filename, mimeType, byteSize, downloadUrl }`
- SSE `file` events emitted AFTER each file is persisted to DB, before the placeholder update
- XLSX and PPTX follow the same persistence pattern through `generatedFileRepository(actor).create({...})`
- Removed `import { generateXlsxFile }` — replaced with `import { generateXlsxBuffer }`
- Added `import { extractPptxJson, generatePptxBuffer }` and `import { generatedFileRepository }`

### XLSX generator refactored
- New `generateXlsxBuffer(data)` returns `{ filename, mimeType, byteSize, buffer }` — no temp file writes
- Uses `workbook.xlsx.writeBuffer()` instead of `writeFile(filepath)`
- Old `generateXlsxFile()` kept as deprecated wrapper for backward compat
- Removed all `node:fs`, `node:os`, `node:path` imports — XLSX is fully DB-backed now
- `Buffer` type cast required `as unknown as Buffer` due to ExcelJS Buffer type mismatch

### FakeLLMProvider chunksJson support
- Added `chunksJson?: string` to `FakeProviderOptions` — JSON string array e.g. `'["chunk1","chunk2"]'`
- Constructor parses `chunksJson` via `JSON.parse(options.chunksJson) as string[]` and uses as chunks
- `getProvider()` in chat.ts checks `process.env.FAKE_PROVIDER_CHUNKS_JSON` BEFORE any other provider, with `chunkDelayMs: 1` for fast tests
- Priority: `FAKE_PROVIDER_CHUNKS_JSON` > `OPENAI_API_KEY` > `FAKE_PROVIDER_ERROR` > default fake

### Orchestrator system prompt
- Added `## Generated Files` section to `buildSystemPrompt()` with PPTX format instructions
- Specifies exact fenced code block format (` ```pptx-json...``` `), max 8 slides, max 8 bullets, character limits, text-only bullets
- Appended after skill instructions and memory entries

### Chat route tests (6 new tests, all pass)
- **PPTX file event**: Chunks with valid `pptx-json` → SSE includes `file` event with `.pptx` filename, correct mimeType, byteSize, downloadUrl
- **Metadata persistence**: After PPTX stream → GET /messages → assistant message has `metadata.files[]` with id/filename/mimeType/downloadUrl
- **DB row verification**: PPTX file → query `generated_chat_file` table → row exists with correct userId, conversationId, filename, content as Buffer
- **XLSX backward compat**: Chunks with valid `xlsx-json` → SSE includes `file` event with `.xlsx` filename (DB-backed, not temp file)
- **Malformed JSON**: `pptx-json` block with invalid JSON → stream completes normally, no `file` event, no generated file row
- **No generated JSON**: Plain text chunks → no `file` events, normal text streaming, finish event emitted

### Key insights
- `FAKE_PROVIDER_CHUNKS_JSON` must be checked BEFORE BYOK settings in `resolveProviderForUser`; if BYOK exists, `getProvider()` is never called
- Tests must clean up `userApiSettings` to prevent BYOK interference; added `beforeAll` to delete any existing rows for the test user
- `afterEach` cleanup of `FAKE_PROVIDER_CHUNKS_JSON` via `delete process.env.FAKE_PROVIDER_CHUNKS_JSON` is necessary to not leak between tests
- `gen_random_uuid()` default in generated_chat_file schema means `id` is auto-generated; chat route uses `crypto.randomUUID()` instead
- SSE `file` events emitted after `finish` event (stream still open in finally block) — clients must handle file events after finish

## 2026-06-21 — Task 7: Browser E2E Playwright test for PPTX download

### Files created
- `apps/fe/playwright.pptx.config.ts` — Separate Playwright config that starts BE with `FAKE_PROVIDER_CHUNKS_JSON` env var via `webServer`. Uses `reuseExistingServer: false` to guarantee the env var is set. Extends `playwright.config.ts` via spread.
- `apps/fe/tests/e2e/pptx-download.spec.ts` — Two tests: live download and history re-download.
- Added `smoke:pptx` script to `apps/fe/package.json`.

### Config approach
- `FAKE_PROVIDER_CHUNKS_JSON` must be set at BE process start because `getProvider()` in `chat.ts` reads `process.env` at request time. The `webServer` config starts the BE with this env var injected.
- The config extends `baseConfig` via `...baseConfig` spread, overriding only `testMatch` and adding `webServer`.
- `webServer.env` spreads `process.env` to preserve DATABASE_URL and other required env vars, then adds `FAKE_PROVIDER_CHUNKS_JSON`.
- `FAKE_PROVIDER_CHUNKS_JSON` is `JSON.stringify(stringArray)` — each array element is a text chunk streamed by `FakeLLMProvider`.

### PPTX chunks design
- 5 chunks form the complete LLM response with a fenced `pptx-json` block:
  1. "Here is your PowerPoint deck:\n\n"
  2. "```pptx-json\n"
  3. JSON.stringify({ title, slides, closing }) — the actual PPTX data
  4. "\n```\n\n"
  5. "You can download it above."
- The BE's `extractPptxJson()` regex matches the fenced block from accumulated text.
- 2 slides with 3 bullets each (within 8-slide/8-bullet limits).

### Test 1: Live download
- Login → New chat → Send "Create a PowerPoint presentation about quarterly planning" → Wait for `a[download$=".pptx"]` → Click + capture download event → Verify filename matches `^slides-.*\\.pptx$` → Read file, check PK ZIP magic bytes (0x50 0x4B).

### Test 2: History re-download
- Same login + chat flow → Wait for download link to appear → Wait for sidebar conversation title to update ("Create a PowerPoint presentation about...") → Reload page → Find conversation in `<aside>` sidebar by title text → Click to load → Verify download link persists → Click → Verify second download is valid PPTX.

### Key insights
- **Title generation isolation**: `generate-title.ts` has its own `getProvider()` that does NOT check `FAKE_PROVIDER_CHUNKS_JSON`. The default `FakeLLMProvider.complete()` returns first 6 words of user message + "..." → "Create a PowerPoint presentation about...". This title is scoped to `<aside>` sidebar to avoid matching the user message text in the transcript.
- **SSE file event ordering**: The BE emits `file` SSE events in the `finally` block AFTER the `finish` event. The FE's `use-stream-chat.ts` handles this correctly — `isStreaming` is already false when `file` events arrive, so the download link appears after streaming stops.
- **Playwright download capture**: `const [download] = await Promise.all([page.waitForEvent("download"), downloadLink.click()])` — must use `Promise.all` to capture the download event that fires on click.
- **ZIP verification**: `.pptx` files are ZIP archives with PK magic bytes at offset 0-1. Reading via `readFileSync(await download.path())` gives a Node.js Buffer for byte-level checks.
- **Conversation persistence**: Conversation ID is client-side state only (no URL routing). After reload, `activeId` is null. The sidebar calls `listConversations()` on mount. Clicking a conversation calls `setActiveId(id)` → `loadMessages(conversationId)` → `mapMessageListItemToChatMessage()` reconstructs messages with `files` from metadata.
- **Sidebar conversation ordering**: New conversations are prepended client-side (`[conversation, ...prev]`). API returns sorted by `desc(id)` (UUID, roughly chronological). Test waits for specific title text in `<aside>` rather than relying on position.
