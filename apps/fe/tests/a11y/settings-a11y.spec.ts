import { expect, test } from "@playwright/test"
import { checkA11yNoViolations, loginAsTestUser } from "./helpers"

const SETTINGS_SECTIONS = ["mcp", "skills", "memory", "advanced"] as const

test.describe("Settings modal accessibility", () => {
  for (const section of SETTINGS_SECTIONS) {
    test(`${section} settings have no serious/critical a11y violations`, async ({ page }) => {
      await loginAsTestUser(page)
      await page.goto(`/chat?settings=${section}`)
      await expect(page.getByRole("dialog", { name: "Settings" })).toBeVisible()
      await checkA11yNoViolations(page, `${section} settings modal`)
    })
  }

  test("focus remains in the dialog and returns to the opener", async ({ page }) => {
    await loginAsTestUser(page)
    const settingsButton = page.getByRole("button", { name: "Settings" })
    await settingsButton.click()

    const dialog = page.getByRole("dialog", { name: "Settings" })
    await expect(dialog).toBeVisible()
    await expect(page.getByRole("button", { name: "Close settings" })).toBeFocused()

    await page.keyboard.press("Shift+Tab")
    expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true)

    await page.keyboard.press("Escape")
    await expect(dialog).toBeHidden()
    await expect(settingsButton).toBeFocused()
  })
})
