'use client';

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
  return (
    <SidebarProvider>
      <AppSidebar
        role={role}
        department={department}
        userCard={userCard}
      />
      <SidebarInset>
        <header className="flex h-14 shrink-0 items-center gap-3 px-4 pt-safe">
          <SidebarTrigger
            className="-ml-1 size-10 touch-manipulation text-muted-foreground hover:text-foreground"
            title="展开或收起侧边导航"
            aria-label="展开或收起侧边导航"
          />
          <div className="min-w-0 flex-1">{breadcrumb}</div>
          {realRole >= ADMIN_ROLE && <ViewAsSwitcher viewAs={viewAs} />}
          <ThemeToggle />
        </header>
        {viewAs && <ViewAsBanner viewAs={viewAs} />}
        <div className="mx-auto flex min-w-0 w-full max-w-7xl flex-1 flex-col gap-4 border-t border-border/50 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] lg:gap-5 lg:p-6 lg:pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
