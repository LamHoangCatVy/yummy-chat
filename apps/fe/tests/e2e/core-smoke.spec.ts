import { expect, test } from "@playwright/test"

/**
 * Core E2E smoke test: auth → chat → history loop.
 *
 * This test proves the critical user journey works end-to-end:
 * 1. Seed user → login
 * 2. Create conversation → send message → see streaming response
 * 3. Reload → verify history persisted
 * 4. Logout → verify redirect to /login
 *
 * Prerequisites:
 * - FE running on BASE_URL (default http://localhost:3000)
 * - BE running on API_BASE_URL (default http://localhost:3001)
 * - Fake LLM provider enabled (no real API key needed)
 * - A seeded test user (email: e2e@test.com, password: password123)
 *
 * Run: bun run smoke:core
 */

const TEST_USER = {
  email: "e2e@test.com",
  password: "password123",
}

test.describe("Core smoke: auth → chat → history", () => {
  test("login → create conversation → send message → see response → reload → verify history → logout", async ({
    page,
  }) => {
    // ── Step 1: Login ──────────────────────────────────────────────────────
    await page.goto("/login")

    // Verify we're on the login page
    await expect(page).toHaveURL(/\/login/)
    await expect(page.getByRole("heading", { name: /yummy-chat/i })).toBeVisible()

    // Fill and submit login form
    await page.getByLabel("Email").fill(TEST_USER.email)
    await page.getByLabel("Password").fill(TEST_USER.password)
    await page.getByRole("button", { name: /sign in/i }).click()

    // Should redirect to /chat
    await expect(page).toHaveURL(/\/chat/, { timeout: 15_000 })

    // ── Step 2: Create conversation ────────────────────────────────────────
    // Click "New chat" button in sidebar
    const newChatButton = page.getByRole("button", { name: /new chat/i })
    await expect(newChatButton).toBeVisible({ timeout: 10_000 })
    await newChatButton.click()

    // ── Step 3: Send message ───────────────────────────────────────────────
    // Find the message input and type a message
    const messageInput = page.getByRole("textbox", { name: /message/i })
    await expect(messageInput).toBeVisible({ timeout: 10_000 })
    await messageInput.fill("Hello from E2E test")
    await messageInput.press("Enter")

    // ── Step 4: See streaming response ─────────────────────────────────────
    // Wait for the user message to appear in the transcript
    await expect(page.getByText("Hello from E2E test")).toBeVisible({ timeout: 10_000 })

    // Wait for the assistant response to start appearing (streaming cursor or text)
    // The fake provider should respond quickly
    await expect(page.getByText("You").first()).toBeVisible({ timeout: 10_000 })

    // ── Step 5: Reload → verify history persisted ──────────────────────────
    await page.reload()

    // After reload, should still be on /chat
    await expect(page).toHaveURL(/\/chat/, { timeout: 15_000 })

    // The conversation list should still show the conversation
    await expect(page.getByText("New chat")).toBeVisible({ timeout: 10_000 })

    // ── Step 6: Logout → verify redirect ───────────────────────────────────
    // Click "Sign out" in the sidebar
    const signOutButton = page.getByRole("button", { name: /sign out/i })
    await expect(signOutButton).toBeVisible({ timeout: 10_000 })
    await signOutButton.click()

    // Should redirect to /login
    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 })
  })

  test("unauthenticated user is redirected to login", async ({ page }) => {
    // Try to access /chat without being logged in
    await page.goto("/chat")

    // Should be redirected to /login
    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 })
  })

  test("sidebar shows conversation list", async ({ page }) => {
    // Login first
    await page.goto("/login")
    await page.getByLabel("Email").fill(TEST_USER.email)
    await page.getByLabel("Password").fill(TEST_USER.password)
    await page.getByRole("button", { name: /sign in/i }).click()
    await expect(page).toHaveURL(/\/chat/, { timeout: 15_000 })

    // Sidebar should be visible on desktop
    const sidebar = page.locator("aside").first()
    await expect(sidebar).toBeVisible({ timeout: 10_000 })

    // "New chat" button should be in the sidebar
    await expect(page.getByRole("button", { name: /new chat/i })).toBeVisible({ timeout: 10_000 })
  })

  test("mobile: hamburger menu opens sidebar drawer", async ({ page }) => {
    // Set viewport to mobile size
    await page.setViewportSize({ width: 375, height: 667 })

    // Login
    await page.goto("/login")
    await page.getByLabel("Email").fill(TEST_USER.email)
    await page.getByLabel("Password").fill(TEST_USER.password)
    await page.getByRole("button", { name: /sign in/i }).click()
    await expect(page).toHaveURL(/\/chat/, { timeout: 15_000 })

    // Desktop sidebar should be hidden on mobile
    const desktopSidebar = page.locator("aside.hidden")
    await expect(desktopSidebar).toBeHidden()

    // Hamburger button should be visible
    const hamburgerButton = page.getByRole("button", { name: /open sidebar/i })
    await expect(hamburgerButton).toBeVisible({ timeout: 10_000 })

    // Click hamburger to open drawer
    await hamburgerButton.click()

    // Mobile drawer should appear
    const mobileDrawer = page.locator("aside.fixed")
    await expect(mobileDrawer).toBeVisible({ timeout: 5_000 })

    // "New chat" button should be visible in the drawer
    await expect(page.getByRole("button", { name: /new chat/i })).toBeVisible({ timeout: 5_000 })

    // Close sidebar button should work
    const closeButton = page.getByRole("button", { name: /close sidebar/i })
    await closeButton.click()

    // Drawer should close
    await expect(mobileDrawer).toBeHidden({ timeout: 5_000 })
  })
})
