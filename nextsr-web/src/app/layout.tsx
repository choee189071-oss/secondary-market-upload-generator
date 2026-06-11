import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "NextSR Upload Generator",
  description: "Municipal secondary-market payload generator for NextSR."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
