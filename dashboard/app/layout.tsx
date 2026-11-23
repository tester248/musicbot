import type { Metadata } from "next";
import Shell from "@/components/Shell";
import "./globals.css";

export const metadata: Metadata = {
  title: "DJ Tester — Console",
  description: "Glass console and web player for the DJ Tester Discord music bot",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen">
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
