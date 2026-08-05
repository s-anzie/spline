import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Spline",
  description: "The console for a workspace and the machines that serve it.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
