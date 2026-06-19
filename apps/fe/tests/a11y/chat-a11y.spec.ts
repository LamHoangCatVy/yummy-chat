import { test } from "@playwright/test"
import { checkA11yNoViolations, loginAsTestUser } from "./helpers"

test.describe("Chat page accessibility", () => {
  test("empty chat state has no serious/critical a11y violations", async ({ page }) => {
    await loginAsTestUser(page)
    await checkA11yNoViolations(page, "empty chat state")
  })

  test("chat sidebar has no serious/critical a11y violations", async ({ page }) => {
    await loginAsTestUser(page)
    const sidebar = page.locator("aside").first()
    await sidebar.waitFor({ state: "visible" })
    await checkA11yNoViolations(page, "chat with sidebar")
  })

  test("chat message input is properly labeled", async ({ page }) => {
    await loginAsTestUser(page)
    const messageInput = page.getByRole("textbox", { name: /message/i })
    await test.expect(messageInput).toBeVisible({ timeout: 10_000 })
  })

  test("new chat button is accessible", async ({ page }) => {
    await loginAsTestUser(page)
    const newChatButton = page.getByRole("button", { name: /new chat/i })
    await test.expect(newChatButton).toBeVisible({ timeout: 10_000 })
  })

  test("sign out button is accessible", async ({ page }) => {
    await loginAsTestUser(page)
    const signOutButton = page.getByRole("button", { name: /sign out/i })
    await test.expect(signOutButton).toBeVisible({ timeout: 10_000 })
  })

  test("mobile sidebar drawer has no serious/critical a11y violations", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 })
    await loginAsTestUser(page)

    const hamburgerButton = page.getByRole("button", { name: /open sidebar/i })
    await test.expect(hamburgerButton).toBeVisible({ timeout: 10_000 })
    await hamburgerButton.click()

    const mobileDrawer = page.locator("aside.fixed")
    await mobileDrawer.waitFor({ state: "visible" })
    await checkA11yNoViolations(page, "mobile sidebar drawer")
  })
})
