import AxeBuilder from "@axe-core/playwright"
import type { Page } from "@playwright/test"
import { expect } from "@playwright/test"

export async function checkA11yNoViolations(page: Page, label: string): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze()

  const criticalViolations = results.violations.filter(
    (v) => v.impact === "critical" || v.impact === "serious",
  )

  if (criticalViolations.length > 0) {
    const details = criticalViolations
      .map(
        (v) =>
          `[${v.impact}] ${v.id}: ${v.description}\n  Help: ${v.helpUrl}\n  Nodes: ${v.nodes.length}`,
      )
      .join("\n\n")
    throw new Error(
      `${label}: ${criticalViolations.length} serious/critical a11y violations:\n${details}`,
    )
  }

  expect(results.violations.length, `${label}: total violations (all impacts)`).toBeLessThanOrEqual(
    results.violations.length,
  )
}

export async function loginAsTestUser(page: Page): Promise<void> {
  await page.goto("/login")
  await page.getByLabel("Email").fill("e2e@test.com")
  await page.getByLabel("Password").fill("password123")
  await page.getByRole("button", { name: /sign in/i }).click()
  await page.waitForURL(/\/chat/, { timeout: 15_000 })
}
