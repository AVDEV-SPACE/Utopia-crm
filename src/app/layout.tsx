import type { Metadata } from "next";
import { ClerkProvider } from '@clerk/nextjs';
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";

export const metadata: Metadata = {
  title: "Utopia CRM",
  description: "Customer Relationship Management pentru Utopia",
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
      <html lang="en" data-theme="dark">
        <body>
          {children}
          <Toaster position="top-center" richColors closeButton />
          <div id="clerk-captcha" className="hidden"></div>
        </body>
      </html>
    </ClerkProvider>
  );
}