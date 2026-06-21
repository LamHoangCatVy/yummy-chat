# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: pptx-download.spec.ts >> PPTX download >> download persists after page reload and conversation re-selection
- Location: tests/e2e/pptx-download.spec.ts:83:3

# Error details

```
Error: expect(page).toHaveURL(expected) failed

Expected pattern: /\/chat/
Received string:  "http://localhost:3000/login"
Timeout: 15000ms

Call log:
  - Expect "toHaveURL" with timeout 15000ms
    34 × unexpected value "http://localhost:3000/login"

```

```yaml
- main:
  - heading "yummy-chat" [level=1]
  - paragraph: Sign in to continue
  - alert: Invalid email or password
  - text: Email
  - textbox "Email":
    - /placeholder: you@example.com
    - text: e2e@test.com
  - text: Password
  - textbox "Password":
    - /placeholder: Enter your password
    - text: password123
  - button "Sign in"
  - paragraph:
    - text: Don't have an account?
    - link "Create one":
      - /url: /register
- alert
```

# Test source

```ts
  1   | import { expect, test } from "@playwright/test"
  2   | import { readFileSync } from "fs"
  3   | 
  4   | /**
  5   |  * PPTX Download E2E tests.
  6   |  *
  7   |  * These tests verify the full flow for PPTX file generation and download:
  8   |  * 1. Live download: send a prompt → streaming response → pptx download link → click → verify
  9   |  * 2. History re-download: reload page → select conversation → download link persisted → click → verify
  10  |  *
  11  |  * Prerequisites:
  12  |  * - FE running on BASE_URL (default http://localhost:3000)
  13  |  * - BE running on API_BASE_URL (default http://localhost:3001)
  14  |  * - BE started with FAKE_PROVIDER_CHUNKS_JSON (set by playwright.pptx.config.ts webServer)
  15  |  * - A seeded test user (email: e2e@test.com, password: password123)
  16  |  *
  17  |  * Run: npm run smoke:pptx
  18  |  */
  19  | 
  20  | const TEST_USER = {
  21  |   email: "e2e@test.com",
  22  |   password: "password123",
  23  | }
  24  | 
  25  | const PPTX_PROMPT = "Create a PowerPoint presentation about quarterly planning"
  26  | 
  27  | /**
  28  |  * The default FakeLLMProvider.complete() returns the first 6 words of the
  29  |  * user message + "...".  The generate-title route uses this default provider
  30  |  * (it does NOT check FAKE_PROVIDER_CHUNKS_JSON), so the auto-generated
  31  |  * conversation title will be "Create a PowerPoint presentation about...".
  32  |  */
  33  | const EXPECTED_CONVERSATION_TITLE = "Create a PowerPoint presentation about"
  34  | 
  35  | test.describe("PPTX download", () => {
  36  |   test("live download appears after chat response", async ({ page }) => {
  37  |     // ── Step 1: Login ────────────────────────────────────────────────────────
  38  |     await page.goto("/login")
  39  |     await expect(page).toHaveURL(/\/login/)
  40  |     await expect(page.getByRole("heading", { name: /yummy-chat/i })).toBeVisible()
  41  | 
  42  |     await page.getByLabel("Email").fill(TEST_USER.email)
  43  |     await page.getByLabel("Password").fill(TEST_USER.password)
  44  |     await page.getByRole("button", { name: /sign in/i }).click()
  45  | 
  46  |     await expect(page).toHaveURL(/\/chat/, { timeout: 15_000 })
  47  | 
  48  |     // ── Step 2: Create a new conversation ────────────────────────────────────
  49  |     const newChatButton = page.getByRole("button", { name: /new chat/i })
  50  |     await expect(newChatButton).toBeVisible({ timeout: 10_000 })
  51  |     await newChatButton.click()
  52  | 
  53  |     // ── Step 3: Send the PPTX prompt ─────────────────────────────────────────
  54  |     const messageInput = page.getByRole("textbox", { name: /message/i })
  55  |     await expect(messageInput).toBeVisible({ timeout: 10_000 })
  56  |     await messageInput.fill(PPTX_PROMPT)
  57  |     await messageInput.press("Enter")
  58  | 
  59  |     // ── Step 4: Wait for the user message to appear in transcript ────────────
  60  |     await expect(page.getByText(PPTX_PROMPT)).toBeVisible({ timeout: 10_000 })
  61  | 
  62  |     // ── Step 5: Wait for the PPTX download link to appear ────────────────────
  63  |     // The link is rendered by FileDownloads: <a download="slides-xxx.pptx" href="...">
  64  |     const downloadLink = page.locator('a[download$=".pptx"]')
  65  |     await expect(downloadLink).toBeVisible({ timeout: 15_000 })
  66  | 
  67  |     // ── Step 6: Click the download link and capture the download event ────────
  68  |     const [download] = await Promise.all([
  69  |       page.waitForEvent("download"),
  70  |       downloadLink.click(),
  71  |     ])
  72  | 
  73  |     // ── Step 7: Verify filename ──────────────────────────────────────────────
  74  |     expect(download.suggestedFilename()).toMatch(/^slides-.*\.pptx$/)
  75  | 
  76  |     // ── Step 8: Read downloaded file and verify ZIP/PPTX header (PK) ─────────
  77  |     const buffer = readFileSync(await download.path())
  78  |     // PK ZIP magic bytes: 0x50 0x4B
  79  |     expect(buffer[0]).toBe(0x50)
  80  |     expect(buffer[1]).toBe(0x4b)
  81  |   })
  82  | 
  83  |   test("download persists after page reload and conversation re-selection", async ({
  84  |     page,
  85  |   }) => {
  86  |     // ── Step 1: Login ────────────────────────────────────────────────────────
  87  |     await page.goto("/login")
  88  |     await expect(page).toHaveURL(/\/login/)
  89  | 
  90  |     await page.getByLabel("Email").fill(TEST_USER.email)
  91  |     await page.getByLabel("Password").fill(TEST_USER.password)
  92  |     await page.getByRole("button", { name: /sign in/i }).click()
  93  | 
> 94  |     await expect(page).toHaveURL(/\/chat/, { timeout: 15_000 })
      |                        ^ Error: expect(page).toHaveURL(expected) failed
  95  | 
  96  |     // ── Step 2: Create a new conversation ────────────────────────────────────
  97  |     const newChatButton = page.getByRole("button", { name: /new chat/i })
  98  |     await expect(newChatButton).toBeVisible({ timeout: 10_000 })
  99  |     await newChatButton.click()
  100 | 
  101 |     // ── Step 3: Send the PPTX prompt ─────────────────────────────────────────
  102 |     const messageInput = page.getByRole("textbox", { name: /message/i })
  103 |     await expect(messageInput).toBeVisible({ timeout: 10_000 })
  104 |     await messageInput.fill(PPTX_PROMPT)
  105 |     await messageInput.press("Enter")
  106 | 
  107 |     // ── Step 4: Wait for download link to appear ─────────────────────────────
  108 |     await expect(page.getByText(PPTX_PROMPT)).toBeVisible({ timeout: 10_000 })
  109 |     const downloadLink = page.locator('a[download$=".pptx"]')
  110 |     await expect(downloadLink).toBeVisible({ timeout: 15_000 })
  111 | 
  112 |     // ── Step 5: Wait for the conversation title to be auto-generated ─────────
  113 |     // The sidebar should show the updated title after generate-title completes.
  114 |     // Scope to <aside> to avoid matching the user message in the transcript.
  115 |     const sidebar = page.locator("aside").first()
  116 |     await expect(sidebar.getByText(EXPECTED_CONVERSATION_TITLE)).toBeVisible({
  117 |       timeout: 15_000,
  118 |     })
  119 | 
  120 |     // ── Step 6: Reload the page ──────────────────────────────────────────────
  121 |     await page.reload()
  122 |     await expect(page).toHaveURL(/\/chat/, { timeout: 15_000 })
  123 | 
  124 |     // ── Step 7: Find and click the conversation in the sidebar ───────────────
  125 |     // After reload, no conversation is active. Click the one we just created.
  126 |     const reloadedSidebar = page.locator("aside").first()
  127 |     await expect(
  128 |       reloadedSidebar.getByText(EXPECTED_CONVERSATION_TITLE),
  129 |     ).toBeVisible({ timeout: 15_000 })
  130 |     await reloadedSidebar.getByText(EXPECTED_CONVERSATION_TITLE).click()
  131 | 
  132 |     // ── Step 8: Wait for messages to load (including the download link) ──────
  133 |     await expect(page.getByText(PPTX_PROMPT)).toBeVisible({ timeout: 10_000 })
  134 | 
  135 |     // The download link must still be visible after history load
  136 |     const historyDownloadLink = page.locator('a[download$=".pptx"]')
  137 |     await expect(historyDownloadLink).toBeVisible({ timeout: 15_000 })
  138 | 
  139 |     // ── Step 9: Click download again and verify it is still a valid PPTX ─────
  140 |     const [download] = await Promise.all([
  141 |       page.waitForEvent("download"),
  142 |       historyDownloadLink.click(),
  143 |     ])
  144 | 
  145 |     expect(download.suggestedFilename()).toMatch(/^slides-.*\.pptx$/)
  146 | 
  147 |     const buffer = readFileSync(await download.path())
  148 |     expect(buffer[0]).toBe(0x50)
  149 |     expect(buffer[1]).toBe(0x4b)
  150 |   })
  151 | })
  152 | 
```