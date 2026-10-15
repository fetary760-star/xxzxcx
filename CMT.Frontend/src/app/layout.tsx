import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { ErrorBoundary } from "@/components/error-boundary";
import { ClientInit } from "./client-init";
import { AuthProvider } from "@/lib/auth-context";
import { TimezoneProvider } from "@/lib/timezone-context";
import { TLPermissionsProvider } from "@/lib/tl-permissions-context";

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-plus-jakarta-sans",
});

export const metadata: Metadata = {
  title: "CMT Task Management System",
  description: "Comprehensive task management system for CMT Engineering",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${plusJakartaSans.variable} antialiased`}>
        <AuthProvider>
          <TLPermissionsProvider>
            <TimezoneProvider>
              <ClientInit />
              <ErrorBoundary>
                {children}
              </ErrorBoundary>
              <Toaster />
            </TimezoneProvider>
          </TLPermissionsProvider>
        </AuthProvider>
      </body>
    </html>
  );
}