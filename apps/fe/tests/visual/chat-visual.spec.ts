import { test } from "@playwright/test"

async function loginAsTestUser(page: import("@playwright/test").Page): Promise<void> {
  await page.goto("/login")
  await page.getByLabel("Email").fill("e2e@test.com")
  await page.getByLabel("Password").fill("password123")
  await page.getByRole("button", { name: /sign in/i }).click()
  await page.waitForURL(/\/chat/, { timeout: 15_000 })
}

test.describe("Chat page visual regression", () => {
  test("empty chat state matches snapshot", async ({ page }) => {
    await loginAsTestUser(page)
    await page.waitForLoadState("networkidle")
    await test.expect(page).toHaveScreenshot("chat-empty.png", {
      maxDiffPixelRatio: 0.01,
    })
  })

  test("chat with sidebar matches snapshot", async ({ page }) => {
    await loginAsTestUser(page)
    const sidebar = page.locator("aside").first()
    await sidebar.waitFor({ state: "visible" })
    await page.waitForLoadState("networkidle")
    await test.expect(page).toHaveScreenshot("chat-with-sidebar.png", {
      maxDiffPixelRatio: 0.01,
    })
  })
})
