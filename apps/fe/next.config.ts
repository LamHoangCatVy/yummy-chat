import path from "node:path"
import { fileURLToPath } from "node:url"
import type { NextConfig } from "next"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.resolve(__dirname, "../.."),
  async rewrites() {
    return [
      {
        source: "/api/v1/:path*",
        destination: `${process.env.API_BASE_URL ?? "http://localhost:3001"}/api/v1/:path*`,
      },
    ]
  },
}

export default nextConfig
