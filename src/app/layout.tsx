import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Version tracking for deployments
export const APP_VERSION = "1.0.3-DEBUG"
export const BUILD_DATE = new Date().toISOString()
export const BUILD_NUMBER = "004"

export const metadata: Metadata = {
  title: `Discord Quest Tool v${APP_VERSION}`,
  description: `Discord Quest Completion Engine - v${APP_VERSION} | Real browser automation for quest completion`,
  keywords: ["Discord", "Quest", "Completion", "RPC", "Activity", "Automation"],
  authors: [{ name: "DQT Team" }],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
