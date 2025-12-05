import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { SettingsProvider } from "@/hooks/useSettings";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "Ensemble - Multi-LLM Intelligence",
  description: "Query multiple AI models simultaneously and get synthesized, optimal responses",
  keywords: ["AI", "LLM", "GPT", "Claude", "Gemini", "OpenRouter", "Multi-model"],
  authors: [{ name: "Ensemble" }],
  openGraph: {
    title: "Ensemble - Multi-LLM Intelligence",
    description: "Query multiple AI models simultaneously and get synthesized, optimal responses",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={inter.variable}>
      <body>
        <SettingsProvider>
          {children}
        </SettingsProvider>
      </body>
    </html>
  );
}
