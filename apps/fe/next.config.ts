import path from "node:path"
import { fileURLToPath } from "node:url"
import type { NextConfig } from "next"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.resolve(__dirname, "../.."),
  // The floating Next.js dev-tools launcher sits at the top-right corner and
  // would block the globally-mounted theme toggle (also top-right) during
  // development. Disable the on-screen dev indicator; build/runtime errors
  // still surface in the overlay (per Next.js devIndicators docs).
  devIndicators: false,
  async rewrites() {
    return [
      {
        source: "/api/v1/:path*",
        destination: `${process.env.API_BASE_URL ?? "http://localhost:3001"}/api/v1/:path*`,
      },
    ]
  },
}

// biome-ignore lint/style/noDefaultExport: Next.js requires a default config export
export default nextConfig
