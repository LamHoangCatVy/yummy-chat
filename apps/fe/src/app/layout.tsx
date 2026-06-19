import type { Metadata } from "next"
import { Geist } from "next/font/google"
import type { ReactNode } from "react"
import "./globals.css"

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist",
})

export const metadata: Metadata = {
  title: "yummy-chat",
  description: "A focused command center for conversing with AI",
}

interface RootLayoutProps {
  readonly children: ReactNode
}

// biome-ignore lint/style/noDefaultExport: Next.js App Router requires default export for layout
export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en" className={geist.variable}>
      <body className="bg-surface-primary text-text-primary font-geist antialiased">
        {children}
      </body>
    </html>
  )
}
