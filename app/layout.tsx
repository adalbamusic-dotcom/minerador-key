import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { cookies } from "next/headers";
import "./globals.css";
import { Providers } from "@/components/providers";
import {
  readSelectedOperationalBrandCookie,
  readShellExpandedCookie,
  SELECTED_OPERATIONAL_BRAND_COOKIE,
  SHELL_EXPANDED_COOKIE,
} from "@/lib/navigation/global-context";
import { getServerValidatedOperationalBrand } from "@/lib/server/shell-initial-state";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false, noarchive: true, noimageindex: true, nosnippet: true } },
  title: "Minerador Key | Planejamento de SEO para agências",
  description: "Agrupamentos semânticos de palavras-chave, nichos inexplorados, análise da concorrência e estratégias de SEO elaboradas em diálogo com IA, marca a marca.",
};

export const dynamic = "force-dynamic";

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const initialExpanded = readShellExpandedCookie(cookieStore.get(SHELL_EXPANDED_COOKIE)?.value);
  const selectedBrandHint = readSelectedOperationalBrandCookie(cookieStore.get(SELECTED_OPERATIONAL_BRAND_COOKIE)?.value);
  const initialOperationalBrand = await getServerValidatedOperationalBrand(selectedBrandHint);

  return (
    <html
      lang="pt-BR"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <Providers initialExpanded={initialExpanded} initialOperationalBrand={initialOperationalBrand}>{children}</Providers>
      </body>
    </html>
  );
}
