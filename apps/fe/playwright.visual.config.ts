import { defineConfig } from "@playwright/test"

const VIEWPORTS = {
  mobile: { width: 375, height: 667 },
  tablet: { width: 768, height: 1024 },
  desktop: { width: 1280, height: 800 },
} as const

export default defineConfig({
  testDir: "./tests/visual",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  retries: 0,
  reporter: [["list"], ["html", { open: "never", outputFolder: "./test-results/visual-report" }]],
  use: {
    baseURL: process.env.BASE_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "on",
    actionTimeout: 10_000,
  },
  projects: [
    {
      name: "visual-mobile",
      use: { browserName: "chromium", viewport: VIEWPORTS.mobile },
    },
    {
      name: "visual-tablet",
      use: { browserName: "chromium", viewport: VIEWPORTS.tablet },
    },
    {
      name: "visual-desktop",
      use: { browserName: "chromium", viewport: VIEWPORTS.desktop },
    },
  ],
  snapshotPathTemplate: "{testDir}/__screenshots__/{testFilePath}/{arg}{ext}",
})
