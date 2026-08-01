'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useRef, type MouseEvent } from 'react';
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
  useSidebar,
} from '@/components/ui/sidebar';
import {
  getMenuGroups,
  getMenuItemTitle,
  isItemActive,
  type MenuItem,
} from '@/components/route';
import { FeishuOAuthStatus } from '@/components/feishu-oauth-status';

interface AppSidebarProps {
  role: number;
  userCard: React.ReactNode;
}

function SidebarNav({ role }: { role: number }) {
  const pathname = usePathname();
  const { setOpenMobile, isMobile } = useSidebar();
  const prevPathname = useRef(pathname);
  const pendingHref = useRef<string | null>(null);
  const pendingTimer = useRef<number | null>(null);

  const groups = useMemo(() => getMenuGroups(role), [role]);
  const singleGroup = groups.length === 1;

  useEffect(() => {
    if (prevPathname.current !== pathname) {
      prevPathname.current = pathname;
      pendingHref.current = null;
      if (isMobile) {
        setOpenMobile(false);
      }
    }
  }, [pathname, isMobile, setOpenMobile]);

  useEffect(() => {
    return () => {
      if (pendingTimer.current) {
        window.clearTimeout(pendingTimer.current);
      }
    };
  }, []);

  const handleNavClick = (
    event: MouseEvent<HTMLAnchorElement>,
    href: string,
    active: boolean,
  ) => {
    if (active || pendingHref.current === href) {
      event.preventDefault();
      if (isMobile) {
        setOpenMobile(false);
      }
      return;
    }

    pendingHref.current = href;
    if (pendingTimer.current) {
      window.clearTimeout(pendingTimer.current);
    }
    pendingTimer.current = window.setTimeout(() => {
      pendingHref.current = null;
    }, 800);
  };

  const renderItem = (item: MenuItem) => {
    const active = isItemActive(pathname, item.path);
    const title = getMenuItemTitle(item, role);
    const href = item.externalHref ?? `/dashboard${item.path}`;
    return (
      <SidebarMenuItem key={item.path || 'profile'}>
        <SidebarMenuButton asChild isActive={active} tooltip={title}>
          {item.externalHref ? (
            <a href={href} target="_blank" rel="noreferrer" title={title}>
              <item.icon />
              <span>{title}</span>
            </a>
          ) : (
            <Link
              href={href}
              aria-current={active ? 'page' : undefined}
              title={title}
              onClick={(event) => handleNavClick(event, href, active)}
            >
              <item.icon />
              <span>{title}</span>
            </Link>
          )}
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  };

  return (
    <>
      {groups.map((group) => (
        <SidebarGroup key={group.id}>
          <SidebarGroupLabel>{singleGroup ? '导航' : group.label}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>{group.items.map(renderItem)}</SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      ))}
    </>
  );
}

export function AppSidebar({ role, userCard }: AppSidebarProps) {
  return (
    <Sidebar>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              asChild
              tooltip="回到工作台"
              className="h-16 gap-2.5 px-2.5 data-[size=lg]:h-16"
            >
              <Link href="/dashboard" aria-label="回到工作台 · 我的资料">
                <Image
                  src="/images/crocodile-transparent.png"
                  alt=""
                  width={48}
                  height={48}
                  priority
                  className="size-12 shrink-0 object-contain"
                />
                <span className="flex min-w-0 flex-col leading-tight">
                  <span className="truncate text-[15px] font-semibold tracking-tight">
                    SAST People
                  </span>
                  <span className="truncate text-[11px] text-muted-foreground">
                    成员与组织平台
                  </span>
                </span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarNav role={role} />
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border/60 p-3">
        <FeishuOAuthStatus role={role} compact />
        {userCard}
      </SidebarFooter>
    </Sidebar>
  );
}
