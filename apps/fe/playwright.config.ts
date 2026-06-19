import { defineConfig } from "@playwright/test"

/**
 * Playwright configuration for yummy-chat E2E tests.
 *
 * These tests run against a running FE+BE stack. Set BASE_URL to override
 * the default (http://localhost:3000). The fake LLM provider is used by
 * default so no real API keys are needed.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: process.env.BASE_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    actionTimeout: 10_000,
  },
  projects: [
    {
      name: "chromium",
      use: { browserName: "chromium" },
    },
  ],
})
