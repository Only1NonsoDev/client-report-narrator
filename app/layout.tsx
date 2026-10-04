import type { Metadata, Viewport } from "next";
import { Fredoka, Nunito } from "next/font/google";

import "./globals.css";

const display = Fredoka({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["500", "600", "700"],
});

const sans = Nunito({
  subsets: ["latin"],
  variable: "--font-sans",
  weight: ["500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "Client Report Narrator",
  description:
    "Paste one month of client numbers and read a plain-English report. Demo mode needs no API key, and every figure comes from the sheet.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f3ecdf",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${display.variable} ${sans.variable}`}>{children}</body>
    </html>
  );
}
