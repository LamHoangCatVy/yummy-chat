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

// Runs before paint to set the theme class from system preference / storage,
// avoiding a flash of the wrong theme. Mirrors chatgpt.com default behavior.
const themeScript = `(function(){try{var m=window.matchMedia('(prefers-color-scheme: dark)');var s=localStorage.getItem('theme');var d=s? s==='dark' : m.matches;if(d)document.documentElement.classList.add('dark');}catch(e){}})()`

interface RootLayoutProps {
  readonly children: ReactNode
}

// biome-ignore lint/style/noDefaultExport: Next.js App Router requires default export for layout
export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en" className={geist.variable} suppressHydrationWarning>
      <head>
        <script
          // biome-ignore lint/security/noDangerouslySetInnerHtml: static theme bootstrap, no user input
          dangerouslySetInnerHTML={{ __html: themeScript }}
        />
      </head>
      <body className="bg-surface-primary text-text-primary font-geist antialiased">
        {children}
      </body>
    </html>
  )
}
