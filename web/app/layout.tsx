import type { Metadata, Viewport } from "next";
import { Caveat, Fira_Code, Nunito } from "next/font/google";

import "./globals.css";
import { AppFrame } from "@/components/app-frame";
import { Providers } from "@/components/providers";
import { SITE_LINE, SITE_NAME, SITE_TAGLINE } from "@/lib/config";

// Nunito for everything read; Caveat for the headings and the reports, written by hand; Fira Code for
// every number: amounts, ids, times and masks.
const nunito = Nunito({ subsets: ["latin"], variable: "--font-nunito", display: "swap" });
const caveat = Caveat({ subsets: ["latin"], weight: ["500", "700"], variable: "--font-caveat", display: "swap" });
const fira = Fira_Code({ subsets: ["latin"], weight: ["400", "600"], variable: "--font-fira", display: "swap" });

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000");

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: `${SITE_NAME}: ${SITE_TAGLINE}`, template: `%s · ${SITE_NAME}` },
  description: SITE_LINE,
  applicationName: SITE_NAME,
};

export const viewport: Viewport = {
  themeColor: "#A3B18A",
  colorScheme: "light",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${nunito.variable} ${caveat.variable} ${fira.variable} antialiased`}>
      <body>
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-full focus:bg-plum focus:px-3 focus:py-2 focus:text-white">
          Skip to the page
        </a>
        <Providers>
          <AppFrame>{children}</AppFrame>
        </Providers>
      </body>
    </html>
  );
}
