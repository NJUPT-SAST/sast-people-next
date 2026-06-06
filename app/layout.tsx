import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { VConsole } from "@/components/vconsole";
import { ThemeProvider } from "@/components/theme-provider";

export const metadata: Metadata = {
  title: "SAST People",
  description: "南京邮电大学大学生科学技术协会招新与留任平台",
  icons: { icon: "/images/sastpeople-logo-black.jpg" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-cn" suppressHydrationWarning>
      <body className="antialiased font-sans">
        <ThemeProvider>
          {children}
          <Toaster />
          <VConsole />
        </ThemeProvider>
      </body>
    </html>
  );
}
