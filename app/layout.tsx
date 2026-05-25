import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { VConsole } from "@/components/vconsole";
import { ThemeProvider } from "@/components/theme-provider";

export const metadata: Metadata = {
  title: "SAST 人员管理",
  description: "南京邮电大学大学生科学技术协会人员管理平台",
  icons: { icon: "/favicon.svg" },
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
