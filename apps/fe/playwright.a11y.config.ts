import { defineConfig } from "@playwright/test"

export default defineConfig({
  testDir: "./tests/a11y",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  retries: 0,
  reporter: [["list"], ["html", { open: "never", outputFolder: "./test-results/a11y-report" }]],
  use: {
    baseURL: process.env.BASE_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    actionTimeout: 10_000,
  },
  projects: [
    {
      name: "a11y-chromium",
      use: { browserName: "chromium" },
    },
  ],
})
