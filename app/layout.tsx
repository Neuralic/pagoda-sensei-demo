import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import HeaderWrapper from "@/components/shared/HeaderWrapper";
import { ActivityApprovalGuard } from "@/components/shared/activity-approval-guard";
import { ImpersonationBanner } from "@/components/shared/impersonation-banner";
import { UnreadProvider } from "@/components/chat/unread-context";
import { PresenceHeartbeat } from "@/components/presence/presence-heartbeat";
import ToasterProvider from "../components/shared/ToasterProvider";
import { BootstrapProvider } from "@/components/shared/bootstrap-context";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Pagoda Travel",
  description: "Pagoda Travel is a platform for travel agents to create and manage their itineraries and proposals.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  /* suppressHydrationWarning: browser extensions often mutate <html>/<body> before hydrate (see Next hydration docs). */
  return (
    <html
      lang="en"
      data-arp=""
      className={`${geistSans.variable} ${geistMono.variable} antialiased h-full`}
      suppressHydrationWarning
    >
      <body className="h-full overflow-hidden" suppressHydrationWarning>
        <div className="flex h-full flex-col overflow-hidden" suppressHydrationWarning>
          <BootstrapProvider>
            <UnreadProvider>
              <ImpersonationBanner />
              <PresenceHeartbeat />
              <HeaderWrapper />
              <ActivityApprovalGuard />
              <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
                {children}
              </div>

              {/* 👇 Global Toaster for all pages */}
              <ToasterProvider />
            </UnreadProvider>
          </BootstrapProvider>
        </div>
      </body>
    </html>
  );
}
