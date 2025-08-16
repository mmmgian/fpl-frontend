import "./globals.css";
import { ReactNode } from "react";

export const metadata = {
  title: "🦞 The Lobster League",
  description: "hub for The Lobster League, workers of the world, unite",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <meta name="theme-color" content="#ffffff" />
      </head>
      <body style={{ fontFamily: 'Helvetica, Arial, sans-serif' }}>{children}</body>
    </html>
  );
}