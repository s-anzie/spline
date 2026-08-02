import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import "katex/dist/katex.min.css";
import { TooltipProvider } from "@/components/ui/tooltip";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-sans",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
});

export const metadata: Metadata = {
  title: "Spline — Agent workspace",
  description:
    "Pilotez vos objectifs, vos tâches et vos agents IA depuis un espace unifié.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="fr"
      className={`dark ${geistSans.variable}`}
      style={{ colorScheme: "dark" }}
    >
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        <TooltipProvider>{children}</TooltipProvider>
      </body>
    </html>
  );
}
