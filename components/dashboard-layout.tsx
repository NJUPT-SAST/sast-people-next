'use client';

import { usePathname } from 'next/navigation';

import {
  SidebarProvider,
  SidebarInset,
  SidebarTrigger,
} from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/app-sidebar';
import { ThemeToggle } from '@/components/theme-toggle';
import { ViewAsBanner, ViewAsSwitcher } from '@/components/view-as-switcher';
import { ADMIN_ROLE } from '@/lib/link/role';
import type { SessionViewAs } from '@/lib/session';

interface DashboardLayoutProps {
  role: number;
  /** 当前账号的 Link 部门标识，仅用于导航展示 */
  department: string | null;
  userCard: React.ReactNode;
  breadcrumb: React.ReactNode;
  children: React.ReactNode;
  /** 会话本身的真实角色：只有管理员能看到「切换身份查看」入口 */
  realRole: number;
  /** 当前临时视角；非空时顶栏常驻提示 + 退出切换 */
  viewAs: SessionViewAs | null;
}

export function DashboardLayout({
  role,
  department,
  userCard,
  breadcrumb,
  children,
  realRole,
  viewAs = null,
}: DashboardLayoutProps) {
  const pathname = usePathname();
  return (
    <SidebarProvider>
      <AppSidebar
        role={role}
        department={department}
        userCard={userCard}
      />
      <SidebarInset>
        <header className="sticky top-0 z-30 flex min-h-16 shrink-0 items-center gap-2 border-b border-border/60 bg-background/80 px-3 pt-safe backdrop-blur-xl supports-[backdrop-filter]:bg-background/70 sm:px-4">
          <SidebarTrigger
            className="-ml-0.5 size-10 touch-manipulation rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground"
            title="展开或收起侧边导航"
            aria-label="展开或收起侧边导航"
          />
          <div className="min-w-0 flex-1">{breadcrumb}</div>
          {realRole >= ADMIN_ROLE && <ViewAsSwitcher viewAs={viewAs} />}
          <ThemeToggle />
        </header>
        {viewAs && <ViewAsBanner viewAs={viewAs} />}
        <div key={pathname} className="mx-auto flex min-w-0 w-full max-w-[86rem] flex-1 flex-col gap-5 px-4 py-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-1 duration-300 sm:px-6 lg:gap-7 lg:px-8 lg:py-8 lg:pb-[max(2rem,env(safe-area-inset-bottom))]">
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
