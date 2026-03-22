import type { Metadata } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import "./globals.css"
import { Toaster } from "@/components/ui/sonner"
import { AuthProvider } from "@/context/auth-context"
import { ThemeProvider } from "next-themes"

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
})

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
})

export const metadata: Metadata = {
  title: "Dev Tools",
  description: "Frontend for Dev Tools",
  icons: {
    icon: [
      { url: "/assets/favicon.svg", type: "image/svg+xml" },
      {
        url: "/assets/logo/favicon/favicon-16x16.ico",
        sizes: "16x16",
        type: "image/x-icon",
      },
    ],
    shortcut: "/assets/logo/favicon/favicon-16x16.ico",
    apple: "/assets/apple-touch-icon.png",
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
        suppressHydrationWarning
      >
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
          <AuthProvider>{children}</AuthProvider>
          <Toaster richColors />
        </ThemeProvider>
      </body>
    </html>
  )
}
