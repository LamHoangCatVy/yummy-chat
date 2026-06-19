import { test } from "@playwright/test"

test.describe("Login page visual regression", () => {
  test("login page matches snapshot", async ({ page }) => {
    await page.goto("/login")
    await page.waitForLoadState("networkidle")
    await test.expect(page).toHaveScreenshot("login-page.png", {
      maxDiffPixelRatio: 0.01,
    })
  })

  test("login page with filled form matches snapshot", async ({ page }) => {
    await page.goto("/login")
    await page.getByLabel("Email").fill("user@example.com")
    await page.getByLabel("Password").fill("password123")
    await page.waitForLoadState("networkidle")
    await test.expect(page).toHaveScreenshot("login-filled.png", {
      maxDiffPixelRatio: 0.01,
    })
  })
})
