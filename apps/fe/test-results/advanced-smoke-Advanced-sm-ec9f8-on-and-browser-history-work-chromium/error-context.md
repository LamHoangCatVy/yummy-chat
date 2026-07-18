# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: advanced-smoke.spec.ts >> Advanced smoke: skills + memory >> settings modal: shortcuts, navigation, and browser history work
- Location: tests/e2e/advanced-smoke.spec.ts:155:3

# Error details

```
Error: expect(page).toHaveURL(expected) failed

Expected pattern: /\/chat/
Received string:  "http://localhost:3100/login"
Timeout: 15000ms

Call log:
  - Expect "toHaveURL" with timeout 15000ms
    34 × unexpected value "http://localhost:3100/login"

```

```yaml
- button "Switch to dark mode"
- main:
  - heading "yummy-chat" [level=1]
  - paragraph: Sign in to continue
  - alert: Invalid origin
  - text: Email
  - textbox "Email":
    - /placeholder: you@example.com
    - text: e2e@test.com
  - text: Password
  - textbox "Password":
    - /placeholder: Enter your password
    - text: password123
  - button "Sign in"
  - paragraph:
    - text: Don't have an account?
    - link "Create one":
      - /url: /register
- alert
```

# Test source

```ts
  1   | import { expect, test } from "@playwright/test"
  2   | import type { Page } from "@playwright/test"
  3   | 
  4   | const TEST_USER = {
  5   |   email: "e2e@test.com",
  6   |   password: "password123",
  7   | }
  8   | 
  9   | type SettingsSection = "mcp" | "skills" | "memory" | "advanced"
  10  | 
  11  | async function openSettings(page: Page, section: SettingsSection = "skills") {
  12  |   if (section === "mcp") {
  13  |     await page.getByRole("button", { name: "MCP servers and tools" }).click()
  14  |   } else {
  15  |     await page.getByRole("button", { name: "Settings" }).click()
  16  |     if (section !== "skills") {
  17  |       await page.getByRole("button", { name: section, exact: true }).click()
  18  |     }
  19  |   }
  20  | 
  21  |   await expect(page).toHaveURL(new RegExp(`/chat\\?settings=${section}`), { timeout: 10_000 })
  22  |   await expect(page.getByRole("dialog", { name: "Settings" })).toBeVisible({ timeout: 10_000 })
  23  | }
  24  | 
  25  | test.describe("Advanced smoke: skills + memory", () => {
  26  |   test.beforeEach(async ({ page }) => {
  27  |     await page.goto("/login")
  28  |     await page.getByLabel("Email").fill(TEST_USER.email)
  29  |     await page.getByLabel("Password").fill(TEST_USER.password)
  30  |     await page.getByRole("button", { name: /sign in/i }).click()
> 31  |     await expect(page).toHaveURL(/\/chat/, { timeout: 15_000 })
      |                        ^ Error: expect(page).toHaveURL(expected) failed
  32  |   })
  33  | 
  34  |   test("create skill → select in chat → verify skill used", async ({ page }) => {
  35  |     const skillName = `E2E Skill ${Date.now()}`
  36  | 
  37  |     // ── Step 1: Open skills settings ─────────────────────────────────────────
  38  |     await openSettings(page)
  39  |     await expect(page.getByRole("heading", { name: /skills/i })).toBeVisible({ timeout: 10_000 })
  40  | 
  41  |     // ── Step 2: Create a new skill ───────────────────────────────────────────
  42  |     await page.getByRole("button", { name: /create skill/i }).click()
  43  | 
  44  |     await page.getByLabel("Name").fill(skillName)
  45  |     await page.getByLabel("Model").fill("fake-provider")
  46  |     await page.getByLabel("System Prompt").fill("You are an E2E test assistant.")
  47  | 
  48  |     await page.getByRole("button", { name: /create skill/i }).click()
  49  | 
  50  |     // ── Step 3: Verify skill appears in the list ─────────────────────────────
  51  |     await expect(page.getByText(skillName)).toBeVisible({ timeout: 10_000 })
  52  | 
  53  |     // ── Step 4: Close settings and select the skill in chat ─────────────────
  54  |     await page.getByRole("button", { name: "Close settings" }).click()
  55  |     await expect(page).toHaveURL(/\/chat/, { timeout: 10_000 })
  56  | 
  57  |     // Create a new conversation
  58  |     const newChatButton = page.getByRole("button", { name: /new chat/i })
  59  |     await expect(newChatButton).toBeVisible({ timeout: 10_000 })
  60  |     await newChatButton.click()
  61  | 
  62  |     // Find and click the skill selector
  63  |     const skillSelector = page.getByRole("button", { name: /select skill/i })
  64  |     await expect(skillSelector).toBeVisible({ timeout: 10_000 })
  65  |     await skillSelector.click()
  66  | 
  67  |     // Select the created skill from the dropdown
  68  |     await page.getByRole("option", { name: new RegExp(skillName, "i") }).click()
  69  | 
  70  |     // Verify skill is selected (button should show the skill name)
  71  |     await expect(page.getByRole("button", { name: new RegExp(skillName, "i") })).toBeVisible({
  72  |       timeout: 5_000,
  73  |     })
  74  | 
  75  |     // ── Step 5: Send a message ──────────────────────────────────────────────
  76  |     const messageInput = page.getByRole("textbox", { name: /message/i })
  77  |     await expect(messageInput).toBeVisible({ timeout: 10_000 })
  78  |     await messageInput.fill("Hello with skill")
  79  |     await messageInput.press("Enter")
  80  | 
  81  |     // Verify the message was sent
  82  |     await expect(page.getByText("Hello with skill")).toBeVisible({ timeout: 10_000 })
  83  | 
  84  |     // ── Step 6: Clean up — delete the skill ──────────────────────────────────
  85  |     await openSettings(page)
  86  |     await expect(page.getByText(skillName)).toBeVisible({ timeout: 10_000 })
  87  | 
  88  |     const deleteButton = page.getByRole("button", { name: new RegExp(`delete ${skillName}`, "i") })
  89  |     await deleteButton.click()
  90  |     await expect(page.getByText(skillName)).not.toBeVisible({ timeout: 5_000 })
  91  |   })
  92  | 
  93  |   test("create memory → verify memory → disable memory → verify disabled", async ({ page }) => {
  94  |     // ── Step 1: Open memory settings ─────────────────────────────────────────
  95  |     await openSettings(page, "memory")
  96  |     await expect(page.getByRole("heading", { name: /memory/i })).toBeVisible({ timeout: 10_000 })
  97  | 
  98  |     // ── Step 2: Enable memory if disabled ─────────────────────────────────────
  99  |     const memoryToggle = page.getByRole("switch", { name: /memory/i })
  100 |     await expect(memoryToggle).toBeVisible({ timeout: 10_000 })
  101 | 
  102 |     // Check if memory is already enabled; if not, enable it
  103 |     const isAlreadyEnabled = await memoryToggle.getAttribute("aria-checked")
  104 |     if (isAlreadyEnabled === "false") {
  105 |       await memoryToggle.click()
  106 |       await expect(memoryToggle).toHaveAttribute("aria-checked", "true", { timeout: 5_000 })
  107 |     }
  108 | 
  109 |     // ── Step 3: Verify memory entries section is visible ─────────────────────
  110 |     await expect(page.getByText(/memory entries/i)).toBeVisible({ timeout: 10_000 })
  111 | 
  112 |     // ── Step 4: Disable memory ───────────────────────────────────────────────
  113 |     await memoryToggle.click()
  114 |     await expect(memoryToggle).toHaveAttribute("aria-checked", "false", { timeout: 5_000 })
  115 | 
  116 |     // ── Step 5: Verify disabled state explanation ─────────────────────────────
  117 |     await expect(page.getByText(/memory is disabled/i)).toBeVisible({ timeout: 5_000 })
  118 | 
  119 |     // ── Step 6: Re-enable memory for cleanup ─────────────────────────────────
  120 |     await memoryToggle.click()
  121 |     await expect(memoryToggle).toHaveAttribute("aria-checked", "true", { timeout: 5_000 })
  122 |   })
  123 | 
  124 |   test("cross-user isolation: skills are user-scoped", async ({ browser }) => {
  125 |     // Create two browser contexts for two different users
  126 |     const context1 = await browser.newContext()
  127 |     const context2 = await browser.newContext()
  128 |     const page1 = await context1.newPage()
  129 |     const _page2 = await context2.newPage()
  130 | 
  131 |     // User 1 logs in
```