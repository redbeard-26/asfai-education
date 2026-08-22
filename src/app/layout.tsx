import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ASFAI Education",
  description: "User-owned learning progress over an open competency graph.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
