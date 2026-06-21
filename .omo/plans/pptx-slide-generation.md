# PPTX Slide Generation from Chat Prompts

## TL;DR
> **Summary**: Add a chat-triggered PPTX generation flow that converts a user prompt into a simple text-only PowerPoint deck, stores the generated file in Postgres, and preserves download links in chat history. Reuse the existing XLSX/SSE download pattern, but replace temp-file serving with owner-scoped durable DB-backed generated files.
> **Deliverables**:
> - Strict shared `pptx-json` schema and file-attachment metadata contract
> - Postgres `generated_chat_file` table + repository for durable PPTX/XLSX-compatible downloads
> - `pptxgenjs` text-only PPTX generator with hard limits
> - Chat stream integration that emits live file downloads and persists `metadata.files`
> - FE history reconstruction so downloads survive reload
> - Vitest + Playwright TDD coverage
> **Effort**: Medium
> **Parallel**: YES - 5 dependency-respecting waves
> **Critical Path**: Task 1 → Task 3 → Task 5 → Task 7 → Task 8

## Context
### Original Request
User asked: "i want this app can create pptx slides from user prompt and downloadable."

### Interview Summary
- First release scope: simple deck only — title slide, content slides, closing slide.
- Entry point: chat action / chat prompt flow, not a dedicated page.
- File lifecycle: generated PPTX must be saved to history for re-download.
- Storage decision: Postgres-backed file table storing bytes + metadata; no object storage for MVP.
- Test decision: TDD with existing Vitest + Playwright infrastructure.
- Explicit exclusions: no rich image/chart/table-heavy generation, no editor, no collaboration, no non-PPTX export formats.

### Metis Review (gaps addressed)
- FE currently drops message `metadata` in `apps/fe/src/lib/api.ts:231-243`, so history cannot show attachments until metadata is preserved and mapped.
- Chat currently persists a completed assistant message before file generation in `apps/be/src/routes/chat.ts:280-324`; generated file metadata must be available before final message metadata is written.
- `apps/be/src/routes/files.ts:15-35` is hardcoded to temp `.xlsx` files and must be replaced with DB-backed generated-file lookup instead of lightly extended.
- `pptx-json` schema must be defined before generator/prompt/route work.
- Guardrails must be explicit: max 10 slides, text-only, content-length limits, max generated file bytes, no advanced deck features.

## Work Objectives
### Core Objective
Allow an authenticated chat user to request a PowerPoint deck, receive a downloadable `.pptx` file in the live transcript, reload the conversation, and download the same persisted file from history.

### Deliverables
- `pptxgenjs` dependency in `apps/be/package.json`.
- Shared schemas/types for `FileAttachment`, `PptxJsonData`, and generated-file metadata.
- DB schema + migration for `generated_chat_file` with byte storage and owner/conversation/message references.
- Repository functions for creating and owner-scoped reading generated files.
- `apps/be/src/lib/llm/pptx-generator.ts` and tests.
- DB-backed `apps/be/src/routes/files.ts` and tests.
- Chat route refactor to generate/persist files before final assistant metadata insert.
- FE message metadata preservation and file reconstruction in history.
- Playwright E2E proving live download and history re-download.

### Definition of Done (verifiable conditions with commands)
- `npm run test -w @yummy/be -- src/lib/llm/pptx-generator.test.ts src/routes/files.test.ts src/routes/chat.test.ts` passes.
- `npm run test -w @yummy/fe -- tests/api-contract.test.ts tests/chat-history-files.test.ts` passes.
- `npm run smoke:core -w @yummy/fe -- tests/e2e/pptx-download.spec.ts` or equivalent Playwright command passes after adding the spec.
- `npm run typecheck` passes.
- `npm run lint` passes.
- Manual agent QA evidence exists under `.omo/evidence/` for live PPTX generation, file download, page reload, and re-download from history.

### Must Have
- Text-only PPTX schema: title, content slides with bullet strings, optional closing text.
- Max 10 slides, max 8 bullets per content slide, max 180 characters per bullet, max 10MB generated file size.
- Persisted file metadata in assistant message `metadata.files`.
- Owner check on every file download; wrong owner returns 404, not 403.
- `Content-Type: application/vnd.openxmlformats-officedocument.presentationml.presentation` for PPTX downloads.
- `Content-Disposition: attachment; filename="...pptx"` with safe ASCII fallback filenames.

### Must NOT Have (guardrails, AI slop patterns, scope boundaries)
- MUST NOT add images, charts, tables, template upload, slide editor, object storage, or background jobs.
- MUST NOT store generated files only in `/tmp` for PPTX history.
- MUST NOT leak whether another user's file exists.
- MUST NOT display raw ```pptx-json``` blocks in assistant transcript.
- MUST NOT test against a real LLM; use `FakeLLMProvider` with deterministic canned output.
- MUST NOT make `generated_chat_file` a general-purpose upload/file-manager feature.

## Verification Strategy
> ZERO HUMAN INTERVENTION - all verification is agent-executed.
- Test decision: TDD with Vitest for shared/BE/FE units and Playwright for browser download/history flow.
- QA policy: Every task has agent-executed scenarios.
- Evidence: `.omo/evidence/task-{N}-{slug}.{ext}`

## Execution Strategy
### Parallel Execution Waves
> Target: 5-8 tasks per wave. <3 per wave (except final) = under-splitting.
> Extract shared dependencies as Wave-1 tasks for max parallelism.

Wave 1: Task 1 shared contracts, Task 2 DB/repository. This wave intentionally has 2 tasks because both are hard prerequisites for most downstream work.
Wave 2: Task 3 PPTX generator, Task 4 DB-backed file route, Task 6 FE metadata/history rendering.
Wave 3: Task 5 chat stream integration.
Wave 4: Task 7 Playwright live/history download.
Wave 5: Task 8 full gates and regression cleanup.

### Dependency Matrix (full, all tasks)
| Task | Blocks | Blocked By |
| --- | --- | --- |
| 1. Shared contracts and dependency | 3,5,6 | None |
| 2. DB table and repository | 4,5,7 | None |
| 3. PPTX generator | 5,7 | 1 |
| 4. DB-backed file route | 7 | 2 |
| 5. Chat stream persistence | 7 | 1,2,3 |
| 6. FE metadata/history rendering | 7 | 1 |
| 7. Playwright live/history download | 8 | 2,3,4,5,6 |
| 8. Full gates and cleanup | Final Verification | 1-7 |

### Agent Dispatch Summary (wave → task count → categories)
| Wave | Task Count | Categories |
| --- | ---: | --- |
| 1 | 2 | quick, unspecified-high |
| 2 | 3 | unspecified-high, visual-engineering |
| 3 | 1 | unspecified-high |
| 4 | 1 | unspecified-high + playwright |
| 5 | 1 | unspecified-high |

## TODOs
> Implementation + Test = ONE task. Never separate.
> EVERY task MUST have: Agent Profile + Parallelization + QA Scenarios.

- [x] 1. Define shared PPTX/file contracts and add server dependency

  **What to do**: Write failing contract tests first, then add `pptxgenjs` to `apps/be/package.json` and update lockfile. In `packages/shared/src/schemas.ts`, add and export:
  - `PPTX_MIME_TYPE = "application/vnd.openxmlformats-officedocument.presentationml.presentation"`
  - `GENERATED_FILE_MAX_BYTES = 10 * 1024 * 1024`
  - `PPTX_LIMITS = { maxSlides: 10, maxContentSlides: 8, maxBulletsPerSlide: 8, maxBulletChars: 180, maxDeckTitleChars: 120, maxSlideTitleChars: 100 }`
  - `fileAttachmentSchema = z.object({ filename: z.string().min(1).max(200), downloadUrl: z.string().min(1), mimeType: z.string().min(1) })`
  - `pptxSlideSchema = z.object({ title: z.string().min(1).max(100), bullets: z.array(z.string().min(1).max(180)).min(1).max(8) }).strict()`
  - `pptxJsonDataSchema = z.object({ title: z.string().min(1).max(120), slides: z.array(pptxSlideSchema).min(1).max(8), closing: z.string().min(1).max(240).optional() }).strict()`
  - Types: `FileAttachment`, `PptxSlideData`, `PptxJsonData`.
  Add schema tests to `apps/fe/tests/api-contract.test.ts` or a new shared-compatible Vitest file so invalid slide counts, overlong bullets, missing title, and unknown keys fail.
  **Must NOT do**: Do not allow arbitrary layout names, images, charts, tables, HTML, theme JSON, or custom PowerPoint XML in the schema.

  **Recommended Agent Profile**:
  - Category: `quick` - Reason: bounded schema/package-manifest work with direct tests.
  - Skills: [] - No specialized skill needed.
  - Omitted: [`frontend-ui-ux`, `playwright`] - No browser/UI work in this task.

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: 3,5,6 | Blocked By: None

  **References** (executor has NO interview context - be exhaustive):
  - Pattern: `packages/shared/src/schemas.ts:14-23` - existing shared Zod schema/type export style.
  - Pattern: `packages/shared/src/schemas.ts:165-187` - exported inferred types.
  - Pattern: `apps/be/package.json:18-30` - server dependencies currently include `exceljs`; add `pptxgenjs` here.
  - Test: `apps/fe/tests/api-contract.test.ts:34-120` - schema conformance tests style.
  - External: `https://gitbrent.github.io/PptxGenJS/docs/usage-saving/` - official saving/output API reference.

  **Acceptance Criteria** (agent-executable only):
  - [ ] `npm install` completes and lockfile contains `pptxgenjs`.
  - [ ] `npm run test -w @yummy/fe -- tests/api-contract.test.ts` passes with new schema assertions.
  - [ ] `npm run typecheck` recognizes exported `FileAttachment` and `PptxJsonData` types from `@yummy/shared`.

  **QA Scenarios** (MANDATORY - task incomplete without these):
  ```
  Scenario: Valid text-only PPTX schema parses
    Tool: Bash
    Steps: Run `npm run test -w @yummy/fe -- tests/api-contract.test.ts` after adding a fixture with title, one slide, bullets, and closing.
    Expected: Test passes and parsed output preserves title/slides/closing.
    Evidence: .omo/evidence/task-1-contracts.txt

  Scenario: Advanced/oversized schema is rejected
    Tool: Bash
    Steps: Run the same test file with fixtures for 9 content slides, 181-character bullet, and unknown `images` property.
    Expected: Each invalid fixture throws Zod validation error.
    Evidence: .omo/evidence/task-1-contracts-error.txt
  ```

  **Commit**: NO | Message: `feat(shared): add pptx generation contracts` | Files: `packages/shared/src/schemas.ts`, `apps/be/package.json`, `package-lock.json`, `apps/fe/tests/api-contract.test.ts` or new contract test

- [x] 2. Add durable generated-file table and owner-scoped repository

  **What to do**: Write failing BE repository tests first. Add `packages/db/src/schema/generated-files.ts` with `generatedChatFile` table and export it from `packages/db/src/schema/index.ts`. Use a Drizzle `customType` for `bytea` if no built-in bytea helper is available:
  - table name: `generated_chat_file`
  - `id text primary key default gen_random_uuid()`
  - `userId text not null references user.id on delete cascade`
  - `conversationId text not null references conversation.id on delete cascade`
  - `messageId text references message.id on delete cascade`
  - `filename text not null`
  - `mimeType text not null`
  - `byteSize integer not null`
  - `content bytea not null`
  - `metadata jsonb`
  - `createdAt/updatedAt timestamp with time zone default now()`
  Add SQL migration `packages/db/drizzle/0004_add_generated_chat_file.sql` manually or via `drizzle-kit generate`, matching existing migration style. Add `generatedFileRepository(actor)` to `apps/be/src/lib/repositories.ts` with `create()`, `getById()`, and no list endpoint. `getById()` must filter by both file ID and `actor.userId`.
  **Must NOT do**: Do not add public file listing, upload APIs, object storage config, or file deletion endpoints beyond cascade behavior.

  **Recommended Agent Profile**:
  - Category: `unspecified-high` - Reason: schema migration, binary DB storage, repository tests.
  - Skills: [] - No specialized skill needed.
  - Omitted: [`playwright`] - No browser needed.

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: 4,5,7 | Blocked By: None

  **References**:
  - Pattern: `packages/db/src/schema/chat.ts:6-29` - table definitions and cascade references.
  - Pattern: `packages/db/src/schema/index.ts:1-7` - schema export barrel.
  - Pattern: `packages/db/drizzle/0000_sleepy_menace.sql:59-76` - table + statement-breakpoint migration style.
  - Pattern: `apps/be/src/lib/repositories.ts:30-149` - owner-scoped conversation repo and conversation-scoped message repo.
  - Test: `apps/be/src/test/db.ts:40-58` - isolated test DB and migration pattern.

  **Acceptance Criteria**:
  - [ ] Test inserts a Buffer with `PK` bytes and reads the same bytes back for the owner.
  - [ ] Test proves a different owner receives `undefined` from `getById()`.
  - [ ] Test proves deleting a conversation cascades generated files.
  - [ ] `npm run db:migrate -w @yummy/db` succeeds against local/test DB.
  - [ ] `npm run test -w @yummy/be -- src/lib/repositories.test.ts` or a new generated-file repository test passes.

  **QA Scenarios**:
  ```
  Scenario: Owner can persist and read binary generated file
    Tool: Bash
    Steps: Run `npm run test -w @yummy/be -- src/lib/generated-files.test.ts` against test Postgres.
    Expected: Read Buffer equals inserted Buffer and metadata fields match.
    Evidence: .omo/evidence/task-2-generated-files.txt

  Scenario: Cross-user access is blocked at repository layer
    Tool: Bash
    Steps: Same test creates file for user A, reads with user B actor.
    Expected: Repository returns undefined, not file bytes.
    Evidence: .omo/evidence/task-2-generated-files-owner-error.txt
  ```

  **Commit**: NO | Message: `feat(db): persist generated chat files` | Files: `packages/db/src/schema/generated-files.ts`, `packages/db/src/schema/index.ts`, `packages/db/drizzle/0004_add_generated_chat_file.sql`, `apps/be/src/lib/repositories.ts`, repository tests

- [x] 3. Build text-only PPTX generator with strict extraction and limits

  **What to do**: Write failing tests in `apps/be/src/lib/llm/pptx-generator.test.ts`, then create `apps/be/src/lib/llm/pptx-generator.ts`. Implement:
  - `extractPptxJson(text: string): PptxJsonData | null` using `/```pptx-json\s*\n([\s\S]*?)\n```/` and `pptxJsonDataSchema.safeParse()`.
  - `generatePptxBuffer(data: PptxJsonData): Promise<{ buffer: Buffer; filename: string; mimeType: typeof PPTX_MIME_TYPE; byteSize: number }>`.
  - Layout: 16:9 wide, title slide first, up to 8 content slides, closing slide last using provided `closing` or `Thank you`.
  - Simple safe styling only: white background, dark text, accent title bar; hex colors without `#`.
  - Enforce `GENERATED_FILE_MAX_BYTES` after buffer generation and throw `PPTX_FILE_TOO_LARGE` if exceeded.
  - Filename format: `slides-${first-8-file-id}.pptx` supplied by caller or returned with a generated UUID; keep ASCII-only.
  **Must NOT do**: Do not fetch remote images, parse Markdown/HTML, add charts/tables, or reuse mutable PptxGenJS options objects across slides.

  **Recommended Agent Profile**:
  - Category: `unspecified-high` - Reason: new binary generation service with library edge cases.
  - Skills: [] - No browser interaction.
  - Omitted: [`frontend-ui-ux`] - Visual polish is constrained to simple generated deck layout.

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: 5,7 | Blocked By: 1

  **References**:
  - Pattern: `apps/be/src/lib/llm/xlsx-generator.ts:18-31` - fenced JSON extraction pattern.
  - Pattern: `apps/be/src/lib/llm/xlsx-generator.ts:33-60` - generated file metadata shape to preserve.
  - Test: `apps/be/src/lib/llm/fake-provider.test.ts:1-53` - Vitest async unit test style.
  - External: `https://gitbrent.github.io/PptxGenJS/docs/usage-saving/` - use `pptx.write({ outputType: "nodebuffer" })`.
  - External: `https://gitbrent.github.io/PptxGenJS/docs/api-text/` - text box/bullet APIs.

  **Acceptance Criteria**:
  - [ ] Valid `pptx-json` block parses to `PptxJsonData`.
  - [ ] Missing or malformed `pptx-json` returns `null` without throwing.
  - [ ] Unknown properties, 9 content slides, 9 bullets, or 181-character bullets return `null`.
  - [ ] Generated buffer begins with ZIP magic bytes `PK` and has PPTX MIME type.
  - [ ] Oversized output throws a typed/reliable error before DB insert.
  - [ ] `npm run test -w @yummy/be -- src/lib/llm/pptx-generator.test.ts` passes.

  **QA Scenarios**:
  ```
  Scenario: Generate valid simple deck buffer
    Tool: Bash
    Steps: Run `npm run test -w @yummy/be -- src/lib/llm/pptx-generator.test.ts` with a 3-slide fixture.
    Expected: Buffer starts with `PK`, byteSize equals buffer length, filename ends `.pptx`.
    Evidence: .omo/evidence/task-3-pptx-generator.txt

  Scenario: Reject unsupported rich content
    Tool: Bash
    Steps: Same test passes JSON with `images`, 9 content slides, and overlong bullet.
    Expected: Extractor returns null or schema error path expected by test; no buffer is generated.
    Evidence: .omo/evidence/task-3-pptx-generator-error.txt
  ```

  **Commit**: NO | Message: `feat(be): generate text-only pptx decks` | Files: `apps/be/src/lib/llm/pptx-generator.ts`, `apps/be/src/lib/llm/pptx-generator.test.ts`

- [x] 4. Replace temp file serving with DB-backed generated-file download route

  **What to do**: Write failing route tests first in `apps/be/src/routes/files.test.ts`, then replace `apps/be/src/routes/files.ts` temp-dir logic with DB lookup. Keep `GET /api/v1/files/:id` and `requireAuth`. Validate UUID; return 404 for invalid UUID, missing file, or wrong owner. On success, return stored bytes with `Content-Type` from DB, `Content-Length`, and safe `Content-Disposition: attachment; filename="${filename}"`. Ensure both PPTX and future DB-backed XLSX rows are served by MIME/filename from DB.
  **Must NOT do**: Do not keep fallback reads from `/tmp/yummy-chat-files`; it would make ownership/history behavior inconsistent.

  **Recommended Agent Profile**:
  - Category: `unspecified-high` - Reason: auth-sensitive binary route replacement.
  - Skills: [] - No specialized skill required.
  - Omitted: [`frontend-ui-ux`] - Backend route only.

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: 7 | Blocked By: 2

  **References**:
  - Current route to replace: `apps/be/src/routes/files.ts:1-47` - hardcoded temp `.xlsx` implementation.
  - Pattern: `apps/be/src/routes/chat.ts:28` - route-level `requireAuth` usage.
  - Pattern: `apps/be/src/routes/chat.ts:95-105` - API error envelope style.
  - Pattern: `apps/be/src/test/db.ts:40-58` - route tests needing migrated test DB.
  - Shared route: `packages/shared/src/routes.ts:1-11` - keep `API_V1.FILES` unchanged.

  **Acceptance Criteria**:
  - [ ] Authenticated owner download returns 200, exact bytes, content type, content length, and attachment filename.
  - [ ] Unauthenticated request returns 401 via `requireAuth`.
  - [ ] Invalid UUID returns 404.
  - [ ] Wrong owner returns 404 and never file bytes.
  - [ ] `npm run test -w @yummy/be -- src/routes/files.test.ts` passes.

  **QA Scenarios**:
  ```
  Scenario: Owner downloads persisted PPTX bytes
    Tool: Bash
    Steps: Run `npm run test -w @yummy/be -- src/routes/files.test.ts` after inserting a generated file row for signed-in user.
    Expected: Response is 200 with PPTX MIME, `attachment`, and byte-for-byte content match.
    Evidence: .omo/evidence/task-4-files-route.txt

  Scenario: Wrong user cannot infer file existence
    Tool: Bash
    Steps: Same route test signs in user B and requests user A's file ID.
    Expected: Response status is 404 with no binary body.
    Evidence: .omo/evidence/task-4-files-route-owner-error.txt
  ```

  **Commit**: NO | Message: `feat(be): serve generated files from database` | Files: `apps/be/src/routes/files.ts`, `apps/be/src/routes/files.test.ts`

- [x] 5. Integrate PPTX/XLSX generated files into chat persistence and SSE

  **What to do**: Write failing chat route tests first using `FakeLLMProvider` canned chunks. Then refactor `apps/be/src/routes/chat.ts` so generated files are persisted before final assistant metadata is stored. Required implementation decisions:
  - Add `messageRepository.update(id, data)` in `apps/be/src/lib/repositories.ts` and update the existing assistant placeholder row (`assistantMsgId`) instead of creating a second completed assistant message at `apps/be/src/routes/chat.ts:284-295`.
  - In the stream `finally`, after streaming text is accumulated and before final `msgRepo.update()`, extract both `xlsx-json` and `pptx-json` blocks.
  - Migrate XLSX generation off temp files: refactor `apps/be/src/lib/llm/xlsx-generator.ts` to return a Buffer/metadata and persist it through `generatedFileRepository`, because Task 4 removes temp serving.
  - Persist each generated file with `{ userId, conversationId, messageId: assistantMsgId, filename, mimeType, byteSize, content }`.
  - Build `metadata.files: FileAttachment[]` where each `downloadUrl` is `/api/v1/files/${fileId}`.
  - Update assistant message metadata with `files`, `model`, `usage`, `failed`, `completedAt`, `skillUsed`, and `memoryEntriesUsed`.
  - Emit one SSE `file` event per generated file after persistence; keep current FE-compatible `{ filename, downloadUrl, mimeType }` payload.
  - Add PPTX prompt instructions in `apps/be/src/lib/chat/orchestrator.ts:196-208` by appending a fixed `## Generated Files` clause to the system prompt: if the user asks for PowerPoint/PPTX/slides/deck, include exactly one fenced `pptx-json` block matching the shared schema, with 1-8 content slides, text bullets only, no images/charts/tables, and no commentary inside the block.
  - Add test-only fake provider support in `getProvider()` for `FAKE_PROVIDER_CHUNKS_JSON` as a JSON string array, so route/E2E tests can emit deterministic `pptx-json` without real LLM calls.
  **Must NOT do**: Do not call a real LLM in tests, do not store PPTX only in message metadata, and do not leave XLSX using temp files after the route replacement.

  **Recommended Agent Profile**:
  - Category: `unspecified-high` - Reason: core streaming/persistence refactor with regression risk.
  - Skills: [] - Backend-focused implementation.
  - Omitted: [`playwright`] - Browser verification is Task 7.

  **Parallelization**: Can Parallel: NO | Wave 3 | Blocks: 7 | Blocked By: 1,2,3

  **References**:
  - Current persistence bug location: `apps/be/src/routes/chat.ts:280-324` - final message is created before generated file metadata exists.
  - Placeholder creation: `apps/be/src/routes/chat.ts:219-231` - update this row instead of creating a duplicate final row.
  - Existing file event protocol: `apps/be/src/routes/chat.ts:307-324` - preserve SSE event name `file` and JSON payload shape.
  - Existing XLSX generator: `apps/be/src/lib/llm/xlsx-generator.ts:33-60` - refactor to DB-persistable Buffer metadata.
  - System prompt builder: `apps/be/src/lib/chat/orchestrator.ts:196-208` - append PPTX format instruction here.
  - Fake provider: `apps/be/src/lib/llm/fake-provider.ts:20-31` and `apps/be/src/routes/chat.ts:58-69` - deterministic chunks pattern and provider selection.

  **Acceptance Criteria**:
  - [ ] Chat route test with canned `pptx-json` emits a `file` SSE event with `.pptx` filename.
  - [ ] The same test verifies `message.metadata.files[0]` is persisted on the assistant message row.
  - [ ] The persisted generated file row has matching `messageId`, `conversationId`, owner ID, MIME, byte size, and bytes.
  - [ ] Existing XLSX path still emits a file event and persists DB-backed XLSX metadata.
  - [ ] Failed PPTX generation emits `FILE_GEN_ERROR` but still persists assistant text with `failed` metadata only when appropriate.
  - [ ] `npm run test -w @yummy/be -- src/routes/chat.test.ts` passes.

  **QA Scenarios**:
  ```
  Scenario: Chat prompt generates persisted PPTX file event
    Tool: Bash
    Steps: Run chat route test with `FAKE_PROVIDER_CHUNKS_JSON` containing text plus a valid `pptx-json` block.
    Expected: SSE includes `file`; DB has generated file; assistant message metadata has same file attachment.
    Evidence: .omo/evidence/task-5-chat-pptx.txt

  Scenario: Malformed PPTX JSON does not crash streaming
    Tool: Bash
    Steps: Run chat route test with malformed `pptx-json` block.
    Expected: Stream completes or emits controlled file-generation error; no generated file row; no unhandled exception.
    Evidence: .omo/evidence/task-5-chat-pptx-error.txt
  ```

  **Commit**: NO | Message: `feat(chat): persist generated pptx attachments` | Files: `apps/be/src/routes/chat.ts`, `apps/be/src/lib/chat/orchestrator.ts`, `apps/be/src/lib/repositories.ts`, `apps/be/src/lib/llm/xlsx-generator.ts`, `apps/be/src/routes/chat.test.ts`

- [x] 6. Preserve file attachments in FE history and hide generated JSON blocks

  **What to do**: Write failing FE tests first, then update FE metadata handling. In `apps/fe/src/lib/api.ts`, add `metadata?: Record<string, unknown> | null` to `MessageListItem` and `messageListItemSchema`. In `apps/fe/src/components/chat/use-stream-chat.ts`, reconstruct `files` during `loadMessages()` from `m.metadata.files` using `fileAttachmentSchema.safeParse()` or `z.array(fileAttachmentSchema).safeParse()`. In `apps/fe/src/components/chat/chat-transcript.tsx`, rename `stripXlsxJsonBlocks()` to `stripGeneratedJsonBlocks()` and strip both `/```xlsx-json...```/` and `/```pptx-json...```/`. Extract parsing/stripping helpers if needed so they can be tested without React Testing Library.
  **Must NOT do**: Do not trust arbitrary metadata blindly; ignore invalid file metadata instead of throwing and blanking the chat.

  **Recommended Agent Profile**:
  - Category: `visual-engineering` - Reason: frontend transcript behavior and download UI persistence.
  - Skills: [] - Existing design is already defined.
  - Omitted: [`frontend-design`] - No new visual design surface; preserve current download button style.

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: 7 | Blocked By: 1

  **References**:
  - Metadata currently missing: `apps/fe/src/lib/api.ts:231-243` - extend interface and Zod schema.
  - History mapping currently drops files: `apps/fe/src/components/chat/use-stream-chat.ts:67-80` - reconstruct `files` here.
  - Live file SSE handling already works: `apps/fe/src/components/chat/use-stream-chat.ts:200-211` - preserve this behavior.
  - Current strip function: `apps/fe/src/components/chat/chat-transcript.tsx:153-155` - extend to PPTX blocks.
  - Current download rendering: `apps/fe/src/components/chat/chat-transcript.tsx:157-169` - preserve style and `download` attribute.

  **Acceptance Criteria**:
  - [ ] `MessageListItem` schema accepts `metadata.files` and still accepts messages without metadata.
  - [ ] `loadMessages()` maps valid `metadata.files` to `ChatMessage.files`.
  - [ ] Invalid `metadata.files` is ignored without throwing.
  - [ ] Assistant display strips both `xlsx-json` and `pptx-json` blocks.
  - [ ] Live SSE file handling still appends files to streaming assistant messages.
  - [ ] `npm run test -w @yummy/fe -- tests/api-contract.test.ts tests/chat-history-files.test.ts` passes.

  **QA Scenarios**:
  ```
  Scenario: Historical message displays persisted PPTX attachment
    Tool: Bash
    Steps: Run FE Vitest helper test with listMessages fixture containing `metadata.files` with PPTX attachment.
    Expected: Mapped ChatMessage includes one file with `.pptx` filename and `/api/v1/files/...` URL.
    Evidence: .omo/evidence/task-6-fe-history.txt

  Scenario: Raw generated JSON blocks are hidden
    Tool: Bash
    Steps: Run FE test for assistant content containing both `xlsx-json` and `pptx-json` fenced blocks.
    Expected: Helper returns human-readable text with both generated JSON blocks removed.
    Evidence: .omo/evidence/task-6-fe-history-error.txt
  ```

  **Commit**: NO | Message: `feat(fe): restore generated file downloads from history` | Files: `apps/fe/src/lib/api.ts`, `apps/fe/src/components/chat/use-stream-chat.ts`, `apps/fe/src/components/chat/chat-transcript.tsx`, `apps/fe/tests/chat-history-files.test.ts`, `apps/fe/package.json` if test script needs inclusion

- [x] 7. Add browser E2E for live PPTX download and history re-download

  **What to do**: Add Playwright test `apps/fe/tests/e2e/pptx-download.spec.ts` following existing authenticated chat smoke patterns. Configure the test run to use fake provider chunks containing a valid `pptx-json` block. Test flow: sign in/register test user, open chat, send "Create a PPTX about quarterly planning", wait for assistant response, assert a download link with `.pptx`, use Playwright `page.waitForEvent("download")` while clicking it, assert suggested filename ends `.pptx`, reload/navigate away and back to same conversation, assert download link still appears, click again, assert second download also ends `.pptx`.
  **Must NOT do**: Do not inspect PowerPoint visually or depend on Microsoft PowerPoint; validate downloaded file extension and ZIP magic bytes using Node file read in test.

  **Recommended Agent Profile**:
  - Category: `unspecified-high` - Reason: full-stack browser test with downloads and deterministic fake LLM setup.
  - Skills: [`playwright`] - Browser automation and download verification.
  - Omitted: [`visual-qa`] - No UI redesign; this is functional E2E.

  **Parallelization**: Can Parallel: NO | Wave 4 | Blocks: 8 | Blocked By: 2,3,4,5,6

  **References**:
  - Existing E2E pattern: `apps/fe/tests/e2e/core-smoke.spec.ts` - auth/chat/history flow style from test infrastructure research.
  - Playwright config: `apps/fe/playwright.config.ts` - default E2E browser config.
  - Download UI: `apps/fe/src/components/chat/chat-transcript.tsx:157-169` - anchor download button to click.
  - Fake provider selection: `apps/be/src/routes/chat.ts:58-69` - deterministic backend behavior must be configured here/through env.

  **Acceptance Criteria**:
  - [ ] E2E proves live `.pptx` download appears after chat response.
  - [ ] E2E reads downloaded file and verifies first two bytes are `PK`.
  - [ ] E2E reloads conversation and proves same download button persists from history.
  - [ ] E2E verifies re-downloaded history file is also `PK` and `.pptx`.
  - [ ] `npm run smoke:core -w @yummy/fe -- tests/e2e/pptx-download.spec.ts` or documented equivalent passes.

  **QA Scenarios**:
  ```
  Scenario: Live chat PPTX download works
    Tool: Playwright
    Steps: Sign in, send PPTX prompt, wait for `.pptx` download link, click it, read downloaded file.
    Expected: Download filename ends `.pptx` and file starts with `PK`.
    Evidence: .omo/evidence/task-7-pptx-download.png

  Scenario: PPTX download survives reload/history
    Tool: Playwright
    Steps: Reload conversation after first download, wait for historical assistant message, click same `.pptx` link again.
    Expected: Link remains visible and second downloaded file starts with `PK`.
    Evidence: .omo/evidence/task-7-pptx-history.png
  ```

  **Commit**: NO | Message: `test(fe): cover pptx download history flow` | Files: `apps/fe/tests/e2e/pptx-download.spec.ts`, Playwright config/test helpers if needed

- [x] 8. Run full gates and remove regressions without expanding scope

  **What to do**: Run the complete verification set and fix only regressions caused by Tasks 1-7. Required commands: `npm run test`, `npm run typecheck`, `npm run lint`, `npm run smoke:core -w @yummy/fe -- tests/e2e/pptx-download.spec.ts` or equivalent documented Playwright command. If generated-file DB changes affect seed/reset, update only the necessary DB reset/migration references. Confirm existing XLSX download functionality remains DB-backed and not broken by route replacement.
  **Must NOT do**: Do not add new product features, new storage backends, UI redesigns, or broad refactors during cleanup.

  **Recommended Agent Profile**:
  - Category: `unspecified-high` - Reason: cross-package regression pass.
  - Skills: [] - General verification and focused fixes.
  - Omitted: [`git-master`] - No commit requested inside task.

  **Parallelization**: Can Parallel: NO | Wave 5 | Blocks: Final Verification | Blocked By: 1-7

  **References**:
  - Root scripts: `package.json:10-25` - verification commands.
  - BE scripts: `apps/be/package.json:5-16` - targeted Vitest scripts.
  - FE scripts: `apps/fe/package.json:6-18` - FE Vitest/Playwright scripts.
  - DB test migration: `apps/be/src/test/db.ts:51-58` - tests use migrations folder.

  **Acceptance Criteria**:
  - [ ] `npm run test` passes.
  - [ ] `npm run typecheck` passes.
  - [ ] `npm run lint` passes.
  - [ ] PPTX Playwright spec passes.
  - [ ] Existing XLSX generated file path has test coverage proving DB-backed download still works.
  - [ ] No `.tmp`, `.pptx`, `.xlsx`, or test download artifacts remain in tracked directories.

  **QA Scenarios**:
  ```
  Scenario: Full automated verification passes
    Tool: Bash
    Steps: Run `npm run test && npm run typecheck && npm run lint` from repo root.
    Expected: All commands exit 0.
    Evidence: .omo/evidence/task-8-full-gates.txt

  Scenario: Scope regression check passes
    Tool: Bash
    Steps: Inspect changed files and run targeted XLSX/PPTX tests.
    Expected: No object storage, image/chart/table deck support, editor UI, or temp-file serving remains for generated chat files.
    Evidence: .omo/evidence/task-8-scope-check.txt
  ```

  **Commit**: YES | Message: `feat(chat): generate downloadable pptx decks` | Files: all intended source, schema, migration, test, package manifest, and lockfile changes

## Final Verification Wave (MANDATORY — after ALL implementation tasks)
> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.
> **Do NOT auto-proceed after verification. Wait for user's explicit approval before marking work complete.**
> **Never mark F1-F4 as checked before getting user's okay.** Rejection or user feedback -> fix -> re-run -> present again -> wait for okay.
- [x] F1. Plan Compliance Audit — oracle
- [x] F2. Code Quality Review — unspecified-high
- [x] F3. Real Manual QA — unspecified-high (+ playwright)
- [x] F4. Scope Fidelity Check — deep

## Commit Strategy
- Single commit recommended after all tests pass: `feat(chat): generate downloadable pptx decks`
- Include files from `apps/be`, `apps/fe`, `packages/db`, `packages/shared`, and lockfile/package manifests only.
- Do not commit `.omo/evidence/*` unless repository convention requires evidence artifacts.

## Success Criteria
- A user can request a simple PPTX deck in chat and see a `.pptx` download button on the assistant response.
- The downloaded file opens as a valid PowerPoint ZIP package and contains title/content/closing slides based on the prompt.
- Reloading the conversation preserves the download button and points to the persisted file.
- Another authenticated user cannot download the file and receives 404.
- Raw `pptx-json` never appears in the assistant transcript.
- All automated gates and final verification agents approve.
