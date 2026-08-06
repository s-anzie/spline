import type { Metadata } from "next";
import localFont from "next/font/local";
import { ThemeProvider } from "next-themes";

import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";

import "./globals.css";

/**
 * Self-hosted, and already in this repository. A font fetched from a CDN is a
 * font that silently falls back when the network says no — and a console read
 * during an incident is exactly when the network is not to be trusted.
 */
const geist = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist",
  weight: "100 900",
  display: "swap",
});

/** Every measured thing wears this: ids, costs, durations, exit codes. */
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Spline",
  description: "The console for a workspace and the machines that serve it.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${geist.variable} ${geistMono.variable} min-h-screen`}>
        {/**
         * Dark by default: this screen sits open on a second monitor all day,
         * often in a room somebody else is also working in. `system` and
         * `light` are one click away in the user menu, and the choice is
         * remembered.
         */}
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem
          disableTransitionOnChange
        >
          <TooltipProvider delayDuration={300}>{children}</TooltipProvider>
          <Toaster position="bottom-right" />
        </ThemeProvider>
      </body>
    </html>
  );
}
