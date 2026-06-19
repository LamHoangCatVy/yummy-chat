import { test } from "@playwright/test"
import { checkA11yNoViolations } from "./helpers"

test.describe("Login page accessibility", () => {
  test("login page has no serious/critical a11y violations", async ({ page }) => {
    await page.goto("/login")
    await checkA11yNoViolations(page, "login page")
  })

  test("login page with error has no serious/critical a11y violations", async ({ page }) => {
    await page.goto("/login")
    await page.getByLabel("Email").fill("bad@test.com")
    await page.getByLabel("Password").fill("wrong")
    await page.getByRole("button", { name: /sign in/i }).click()
    await page.waitForTimeout(2000)
    await checkA11yNoViolations(page, "login page with error")
  })

  test("login form elements are properly labeled", async ({ page }) => {
    await page.goto("/login")
    await test.expect(page.getByLabel("Email")).toBeVisible()
    await test.expect(page.getByLabel("Password")).toBeVisible()
    await test.expect(page.getByRole("button", { name: /sign in/i })).toBeVisible()
  })
})
