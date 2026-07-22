'use client';

import {
  SidebarProvider,
  SidebarInset,
  SidebarTrigger,
} from '@/components/ui/sidebar';
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
        <header className="flex h-14 shrink-0 items-center gap-3 px-4 pt-safe">
          <SidebarTrigger
            className="-ml-1 size-10 touch-manipulation text-muted-foreground hover:text-foreground"
            title="展开或收起侧边导航"
            aria-label="展开或收起侧边导航"
          />
          <div className="min-w-0 flex-1">{breadcrumb}</div>
          <ThemeToggle />
        </header>
        <div className="mx-auto flex min-w-0 w-full max-w-7xl flex-1 flex-col gap-4 border-t border-border/50 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] lg:gap-5 lg:p-6 lg:pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
