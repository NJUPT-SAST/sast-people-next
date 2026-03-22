'use client';

import { SidebarProvider, SidebarInset, SidebarTrigger } from '@/components/ui/sidebar';
import { Separator } from '@/components/ui/separator';
import { AppSidebar } from '@/components/app-sidebar';
import { ThemeToggle } from '@/components/theme-toggle';

interface DashboardLayoutProps {
  role: number;
  userCard: React.ReactNode;
  breadcrumb: React.ReactNode;
  children: React.ReactNode;
}

export function DashboardLayout({
  role,
  userCard,
  breadcrumb,
  children,
}: DashboardLayoutProps) {
  return (
    <SidebarProvider>
      <AppSidebar role={role} userCard={userCard} />
      <SidebarInset>
        <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4" />
          <div className="min-w-0 flex-1">{breadcrumb}</div>
          <ThemeToggle />
        </header>
        <div className="flex flex-1 flex-col gap-4 p-4 lg:gap-6 lg:p-6 w-full max-w-6xl mx-auto">
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
