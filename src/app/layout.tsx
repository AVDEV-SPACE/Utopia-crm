import type { Metadata } from "next";
import Script from "next/script";
import { ClerkProvider } from '@clerk/nextjs';
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { fontVariables } from "@/lib/fonts";

const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_ID || "G-S5WMSYDFFZ";

export const metadata: Metadata = {
  title: "Utopia CRM",
  description: "Customer Relationship Management pentru Utopia",
  // Iconițele din /public — declarate explicit, ca browserul să prefere SVG-ul
  // (crisp la orice densitate) în loc să ghicească doar /favicon.ico
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon-96x96.png", type: "image/png", sizes: "96x96" },
      { url: "/favicon.ico", sizes: "any" },
    ],
    shortcut: "/favicon.ico",
    apple: "/favicon-96x96.png",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ClerkProvider
      publishableKey={process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY}
      signInUrl="/auth/sign-in"
      signUpUrl="/auth/sign-up"
    >
      <html lang="en" data-theme="dark" className={fontVariables}>
        <body>
          {children}
          <Toaster position="top-center" richColors closeButton />
          <div id="clerk-captcha" className="hidden"></div>

          {/* Google Analytics 4 — încărcat după hidratare, ca să nu blocheze randarea */}
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
            strategy="afterInteractive"
          />
          <Script id="google-analytics" strategy="afterInteractive">
            {`
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('js', new Date());
              gtag('config', '${GA_MEASUREMENT_ID}');
            `}
          </Script>
        </body>
      </html>
    </ClerkProvider>
  );
}