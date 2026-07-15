import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CoreCareOne — Pre-Visit Companion",
  description:
    "An agentic pre-visit companion that turns a situation-first conversation into a validated, risk-stratified brief for your care team.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
