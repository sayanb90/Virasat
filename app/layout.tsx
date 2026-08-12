import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Navbar } from "@/components/Navbar";
import { MobileDeviceFrame } from "@/components/MobileDeviceFrame";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: "Virasat | Digital Estate Vault App",
  description: "Senior-friendly cross-platform digital estate vault & safety switch mobile application for iOS & Android.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${mono.variable} h-full dark`}>
      <body className="min-h-full bg-[#06070B] text-gray-100 font-sans flex flex-col antialiased selection:bg-emerald-500 selection:text-black">
        <MobileDeviceFrame>
          <Navbar />
          <main className="flex-1 px-4 py-4 pb-20">
            {children}
          </main>
        </MobileDeviceFrame>
      </body>
    </html>
  );
}
