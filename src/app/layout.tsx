import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./ui.css";

// KTD6: database reads are not fetch calls, so nothing may be prerendered or cached at build time.
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Kindwords" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
