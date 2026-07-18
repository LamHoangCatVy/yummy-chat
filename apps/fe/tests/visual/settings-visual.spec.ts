import { test } from "@playwright/test"

async function loginAsTestUser(page: import("@playwright/test").Page): Promise<void> {
  await page.goto("/login")
  await page.getByLabel("Email").fill("e2e@test.com")
  await page.getByLabel("Password").fill("password123")
  await page.getByRole("button", { name: /sign in/i }).click()
  await page.waitForURL(/\/chat/, { timeout: 15_000 })
}

test.describe("Settings pages visual regression", () => {
  for (const section of ["mcp", "skills", "memory", "advanced"] as const) {
    test(`${section} settings modal matches snapshot`, async ({ page }) => {
      await loginAsTestUser(page)
      await page.goto(`/chat?settings=${section}`)
      await page.getByRole("dialog", { name: "Settings" }).waitFor({ state: "visible" })
      await page.waitForLoadState("networkidle")
      await test.expect(page).toHaveScreenshot(`settings-modal-${section}.png`, {
        maxDiffPixelRatio: 0.01,
      })
    })
  }

  test("chat composer with model dropdown matches snapshot", async ({ page }) => {
    await loginAsTestUser(page)
    await page.goto("/chat")
    await page.waitForLoadState("networkidle")

    const modelButton = page.getByRole("combobox", { name: "Model" })
    await modelButton.waitFor({ state: "visible", timeout: 10_000 })
    await modelButton.click()
    await page.getByRole("listbox", { name: "Available models" }).waitFor({
      state: "visible",
      timeout: 5_000,
    })

    await test.expect(page).toHaveScreenshot("chat-model-dropdown.png", {
      maxDiffPixelRatio: 0.01,
    })
  })
})
