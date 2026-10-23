import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { VConsole } from "@/components/vconsole";
import { ThemeProvider } from "@/components/theme-provider";

export const metadata: Metadata = {
  title: "SAST People",
  description: "南京邮电大学大学生科学技术协会成员与组织平台",
  icons: { icon: "/images/crocodile-favicon.png" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f8fbf9" },
    { media: "(prefers-color-scheme: dark)", color: "#1b241f" },
  ],
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
