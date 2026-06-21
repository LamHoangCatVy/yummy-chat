import { defineConfig } from "@playwright/test"
import baseConfig from "./playwright.config"

/**
 * FAKE_PROVIDER_CHUNKS_JSON payload: deterministic LLM response that includes
 * a fenced `pptx-json` code block. The BE's FakeLLMProvider streams these
 * chunks, and the chat route's finally block extracts the PPTX JSON, generates
 * a real .pptx file via pptxgenjs, persists it to DB, and emits a `file` SSE
 * event with the download URL.
 *
 * Each chunk is streamed as a text-delta. The third chunk contains the
 * multi-line `pptx-json` fenced block that extractPptxJson() parses.
 */
const PPTX_JSON_DATA = JSON.stringify({
  title: "Quarterly Business Review",
  slides: [
    {
      title: "Q1 Highlights",
      bullets: [
        "Revenue grew 15%",
        "New customer acquisition up 22%",
        "Product launch on schedule",
      ],
    },
    {
      title: "Q2 Goals",
      bullets: [
        "Expand to APAC market",
        "Hire 5 engineers",
        "Reduce churn to under 3%",
      ],
    },
  ],
  closing: "Thank you for your attention",
})

const FAKE_PPTX_CHUNKS = [
  "Here is your PowerPoint deck:\n\n",
  "```pptx-json\n",
  PPTX_JSON_DATA,
  "\n```\n\n",
  "You can download it above.",
]

export default defineConfig({
  ...baseConfig,
  // Only run the PPTX download spec
  testMatch: "pptx-download.spec.ts",

  // Start the BE with FAKE_PROVIDER_CHUNKS_JSON so the chat route uses
  // deterministic chunks that contain a valid pptx-json block.
  webServer: {
    command: "npm run dev",
    cwd: "../be",
    port: 3001,
    env: {
      ...(process.env as Record<string, string>),
      FAKE_PROVIDER_CHUNKS_JSON: JSON.stringify(FAKE_PPTX_CHUNKS),
    },
    // Always start a fresh BE to guarantee FAKE_PROVIDER_CHUNKS_JSON is set.
    // Reusing an already-running BE (without the env var) would break the test.
    reuseExistingServer: false,
    timeout: 30_000,
  },
})
