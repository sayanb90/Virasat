import type { Metadata, Viewport } from "next";
import { Inter, Source_Serif_4 } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/AppShell";
import { IS_NATIVE_BUILD } from "@/lib/config";
import { NATIVE_RELOAD_TO_ROOT } from "@/lib/native/reloadToRoot";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

// The wordmark only. Loaded as a variable font so there is no weight list to
// keep in step, and scoped to a CSS variable rather than applied globally —
// body copy stays in Inter, which is the more legible of the two at 17px for
// the readers this is built for.
const sourceSerif = Source_Serif_4({ subsets: ["latin"], variable: "--font-serif" });

export const metadata: Metadata = {
  title: "Virasat | Your legacy, kept safe",
  description:
    "A private, encrypted place to record what your family will need to know — and a gentle check-in that passes it on only when the time comes.",
};

export const viewport: Viewport = {
  themeColor: "#0b2733",
  width: "device-width",
  initialScale: 1,
  // Draw behind the status bar and home indicator so the ink header runs
  // edge to edge. This is also what makes env(safe-area-inset-*) non-zero,
  // so every surface that touches a screen edge must pad for it.
  viewportFit: "cover",
};

// See lib/native/reloadToRoot.ts: a deep reload in the shell gets the root page.

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${sourceSerif.variable}`}>
      {IS_NATIVE_BUILD && (
        <head>
          <script dangerouslySetInnerHTML={{ __html: NATIVE_RELOAD_TO_ROOT }} />
        </head>
      )}
      <body className="font-sans antialiased">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
