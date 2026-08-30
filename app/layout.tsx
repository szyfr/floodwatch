import type { Metadata, Viewport } from "next"
import { Geist, Geist_Mono, Inter } from "next/font/google"

import "./globals.css"
import { AppProviders } from "@/components/providers/app-providers"
import { ThemeProvider } from "@/components/theme-provider"
import { Toaster } from "@/components/ui/sonner"
import { getSessionUser } from "@/lib/auth/session"
import { cn } from "@/lib/utils"

const fontSans = Geist({ subsets: ["latin"], variable: "--font-sans" })
const fontMono = Geist_Mono({ subsets: ["latin"], variable: "--font-mono" })
const fontUi = Inter({ subsets: ["latin"], variable: "--font-ui" })

export const metadata: Metadata = {
  title: {
    default: "Pampanga Flood Watch",
    template: "%s · Pampanga Flood Watch",
  },
  description:
    "Live flood reports, river gauges, safe zones and DRRM alerts for the 22 cities and municipalities of Pampanga.",
  applicationName: "Pampanga Flood Watch",
}

export const viewport: Viewport = {
  themeColor: "#0f172a",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
}

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await getSessionUser()

  return (
    <html
      lang={user?.language ?? "en"}
      suppressHydrationWarning
      className={cn(
        "antialiased",
        fontSans.variable,
        fontMono.variable,
        fontUi.variable
      )}
    >
      <body>
        {/* The design ships one light palette; there is no dark counterpart. */}
        <ThemeProvider forcedTheme="light" enableSystem={false}>
          <AppProviders user={user} initialLanguage={user?.language ?? "en"}>
            {children}
          </AppProviders>
          <Toaster position="bottom-center" closeButton />
        </ThemeProvider>
      </body>
    </html>
  )
}
