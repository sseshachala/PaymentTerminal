'use client'
import './globals.css'
import { SessionProvider } from 'next-auth/react'

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-gray-950 text-gray-100 antialiased min-h-screen">
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  )
}
