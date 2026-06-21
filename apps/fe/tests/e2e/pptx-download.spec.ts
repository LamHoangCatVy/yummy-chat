import { expect, test } from "@playwright/test"
import { readFileSync } from "fs"

/**
 * PPTX Download E2E tests.
 *
 * These tests verify the full flow for PPTX file generation and download:
 * 1. Live download: send a prompt → streaming response → pptx download link → click → verify
 * 2. History re-download: reload page → select conversation → download link persisted → click → verify
 *
 * Prerequisites:
 * - FE running on BASE_URL (default http://localhost:3000)
 * - BE running on API_BASE_URL (default http://localhost:3001)
 * - BE started with FAKE_PROVIDER_CHUNKS_JSON (set by playwright.pptx.config.ts webServer)
 * - A seeded test user (email: e2e@test.com, password: password123)
 *
 * Run: npm run smoke:pptx
 */

const TEST_USER = {
  email: "e2e@test.com",
  password: "password123",
}

const PPTX_PROMPT = "Create a PowerPoint presentation about quarterly planning"

/**
 * The default FakeLLMProvider.complete() returns the first 6 words of the
 * user message + "...".  The generate-title route uses this default provider
 * (it does NOT check FAKE_PROVIDER_CHUNKS_JSON), so the auto-generated
 * conversation title will be "Create a PowerPoint presentation about...".
 */
const EXPECTED_CONVERSATION_TITLE = "Create a PowerPoint presentation about"

test.describe("PPTX download", () => {
  test("live download appears after chat response", async ({ page }) => {
    // ── Step 1: Login ────────────────────────────────────────────────────────
    await page.goto("/login")
    await expect(page).toHaveURL(/\/login/)
    await expect(page.getByRole("heading", { name: /yummy-chat/i })).toBeVisible()

    await page.getByLabel("Email").fill(TEST_USER.email)
    await page.getByLabel("Password").fill(TEST_USER.password)
    await page.getByRole("button", { name: /sign in/i }).click()

    await expect(page).toHaveURL(/\/chat/, { timeout: 15_000 })

    // ── Step 2: Create a new conversation ────────────────────────────────────
    const newChatButton = page.getByRole("button", { name: /new chat/i })
    await expect(newChatButton).toBeVisible({ timeout: 10_000 })
    await newChatButton.click()

    // ── Step 3: Send the PPTX prompt ─────────────────────────────────────────
    const messageInput = page.getByRole("textbox", { name: /message/i })
    await expect(messageInput).toBeVisible({ timeout: 10_000 })
    await messageInput.fill(PPTX_PROMPT)
    await messageInput.press("Enter")

    // ── Step 4: Wait for the user message to appear in transcript ────────────
    await expect(page.getByText(PPTX_PROMPT)).toBeVisible({ timeout: 10_000 })

    // ── Step 5: Wait for the PPTX download link to appear ────────────────────
    // The link is rendered by FileDownloads: <a download="slides-xxx.pptx" href="...">
    const downloadLink = page.locator('a[download$=".pptx"]')
    await expect(downloadLink).toBeVisible({ timeout: 15_000 })

    // ── Step 6: Click the download link and capture the download event ────────
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      downloadLink.click(),
    ])

    // ── Step 7: Verify filename ──────────────────────────────────────────────
    expect(download.suggestedFilename()).toMatch(/^slides-.*\.pptx$/)

    // ── Step 8: Read downloaded file and verify ZIP/PPTX header (PK) ─────────
    const buffer = readFileSync(await download.path())
    // PK ZIP magic bytes: 0x50 0x4B
    expect(buffer[0]).toBe(0x50)
    expect(buffer[1]).toBe(0x4b)
  })

  test("download persists after page reload and conversation re-selection", async ({
    page,
  }) => {
    // ── Step 1: Login ────────────────────────────────────────────────────────
    await page.goto("/login")
    await expect(page).toHaveURL(/\/login/)

    await page.getByLabel("Email").fill(TEST_USER.email)
    await page.getByLabel("Password").fill(TEST_USER.password)
    await page.getByRole("button", { name: /sign in/i }).click()

    await expect(page).toHaveURL(/\/chat/, { timeout: 15_000 })

    // ── Step 2: Create a new conversation ────────────────────────────────────
    const newChatButton = page.getByRole("button", { name: /new chat/i })
    await expect(newChatButton).toBeVisible({ timeout: 10_000 })
    await newChatButton.click()

    // ── Step 3: Send the PPTX prompt ─────────────────────────────────────────
    const messageInput = page.getByRole("textbox", { name: /message/i })
    await expect(messageInput).toBeVisible({ timeout: 10_000 })
    await messageInput.fill(PPTX_PROMPT)
    await messageInput.press("Enter")

    // ── Step 4: Wait for download link to appear ─────────────────────────────
    await expect(page.getByText(PPTX_PROMPT)).toBeVisible({ timeout: 10_000 })
    const downloadLink = page.locator('a[download$=".pptx"]')
    await expect(downloadLink).toBeVisible({ timeout: 15_000 })

    // ── Step 5: Wait for the conversation title to be auto-generated ─────────
    // The sidebar should show the updated title after generate-title completes.
    // Scope to <aside> to avoid matching the user message in the transcript.
    const sidebar = page.locator("aside").first()
    await expect(sidebar.getByText(EXPECTED_CONVERSATION_TITLE)).toBeVisible({
      timeout: 15_000,
    })

    // ── Step 6: Reload the page ──────────────────────────────────────────────
    await page.reload()
    await expect(page).toHaveURL(/\/chat/, { timeout: 15_000 })

    // ── Step 7: Find and click the conversation in the sidebar ───────────────
    // After reload, no conversation is active. Click the one we just created.
    const reloadedSidebar = page.locator("aside").first()
    await expect(
      reloadedSidebar.getByText(EXPECTED_CONVERSATION_TITLE),
    ).toBeVisible({ timeout: 15_000 })
    await reloadedSidebar.getByText(EXPECTED_CONVERSATION_TITLE).click()

    // ── Step 8: Wait for messages to load (including the download link) ──────
    await expect(page.getByText(PPTX_PROMPT)).toBeVisible({ timeout: 10_000 })

    // The download link must still be visible after history load
    const historyDownloadLink = page.locator('a[download$=".pptx"]')
    await expect(historyDownloadLink).toBeVisible({ timeout: 15_000 })

    // ── Step 9: Click download again and verify it is still a valid PPTX ─────
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      historyDownloadLink.click(),
    ])

    expect(download.suggestedFilename()).toMatch(/^slides-.*\.pptx$/)

    const buffer = readFileSync(await download.path())
    expect(buffer[0]).toBe(0x50)
    expect(buffer[1]).toBe(0x4b)
  })
})
