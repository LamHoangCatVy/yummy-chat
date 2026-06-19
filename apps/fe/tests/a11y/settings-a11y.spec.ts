import { test } from "@playwright/test"
import { checkA11yNoViolations, loginAsTestUser } from "./helpers"

test.describe("Settings pages accessibility", () => {
  test("settings page has no serious/critical a11y violations", async ({ page }) => {
    await loginAsTestUser(page)
    await page.goto("/settings")
    await checkA11yNoViolations(page, "settings page")
  })

  test("skills settings page has no serious/critical a11y violations", async ({ page }) => {
    await loginAsTestUser(page)
    await page.goto("/settings/skills")
    await checkA11yNoViolations(page, "skills settings page")
  })

  test("memory settings page has no serious/critical a11y violations", async ({ page }) => {
    await loginAsTestUser(page)
    await page.goto("/settings/memory")
    await checkA11yNoViolations(page, "memory settings page")
  })
})
