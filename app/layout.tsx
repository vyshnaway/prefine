import type { Metadata } from "next";
import PwaInitializer from "./components/PwaInitializer";
import "./globals.css";
import { AuthProvider } from "./lib/auth-context";
import { PACKAGE_NAME } from "./types";
import { Geist, Geist_Mono } from "next/font/google";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});


export const metadata: Metadata = {
  title: PACKAGE_NAME,
  description: "A image refining and quality auditing workspace.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <AuthProvider>
          <PwaInitializer />
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}