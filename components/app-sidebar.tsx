'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useRef } from 'react';
import Image from 'next/image';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarSeparator,
  useSidebar,
} from '@/components/ui/sidebar';
import { menuItems, isItemActive, getMenuItemTitle } from '@/components/route';

interface AppSidebarProps {
  role: number;
  userCard: React.ReactNode;
}

function SidebarNav({ role }: { role: number }) {
  const pathname = usePathname();
  const { setOpenMobile, isMobile } = useSidebar();
  const prevPathname = useRef(pathname);

  const authRoutes = useMemo(() => {
    if (role === 0) return [menuItems[0], menuItems[1]];
    if (role === 1) return [menuItems[0], menuItems[1]];
    if (role === 2) return [menuItems[0], menuItems[1], menuItems[2], menuItems[3], menuItems[4]];
    return menuItems;
  }, [role]);

  useEffect(() => {
    if (prevPathname.current !== pathname) {
      prevPathname.current = pathname;
      if (isMobile) {
        setOpenMobile(false);
      }
    }
  }, [pathname, isMobile, setOpenMobile]);

  return (
    <SidebarMenu>
      {authRoutes.map((item) => {
        const active = isItemActive(pathname, item.path);
        const title = getMenuItemTitle(item, role);
        const href = item.externalHref ?? `/dashboard${item.path}`;
        return (
          <SidebarMenuItem key={item.title}>
            <SidebarMenuButton asChild isActive={active} tooltip={title}>
              {item.externalHref ? (
                <a href={href} target="_blank" rel="noreferrer">
                  <item.icon />
                  <span>{title}</span>
                </a>
              ) : (
                <Link href={href}>
                  <item.icon />
                  <span>{title}</span>
                </Link>
              )}
            </SidebarMenuButton>
          </SidebarMenuItem>
        );
      })}
    </SidebarMenu>
  );
}

export function AppSidebar({ role, userCard }: AppSidebarProps) {
  return (
    <Sidebar>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link href="/">
                <div className="flex items-center justify-center">
                  <Image
                    src="/images/logo.png"
                    alt="SAST"
                    width={48}
                    height={24}
                    className="h-6 w-auto dark:hidden"
                  />
                  <Image
                    src="/images/white-logo.png"
                    alt="SAST"
                    width={48}
                    height={24}
                    className="hidden h-6 w-auto dark:block"
                  />
                </div>
                <div className="flex flex-col gap-0.5 leading-none">
                  <span className="font-semibold">SAST 人员管理</span>
                  <span className="text-xs text-muted-foreground">人员管理平台</span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarSeparator />
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>导航</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarNav role={role} />
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarSeparator />
      <SidebarFooter>{userCard}</SidebarFooter>
    </Sidebar>
  );
}
