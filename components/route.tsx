'use client';
import { usePathname } from 'next/navigation';
import {
  UserPen,
  Workflow,
  FilePenLine,
  Users,
  ArrowDownWideNarrow,
  SquareChartGantt,
  ClipboardCheck,
  FileWarning,
  Mail,
  ScrollText,
  type LucideIcon,
} from 'lucide-react';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from './ui/breadcrumb';
import { cn } from '@/lib/utils';
import { SENTRY_ISSUES_URL } from '@/lib/sentry';

export type MenuGroupId = 'me' | 'work' | 'manage';

export interface MenuItem {
  title: string;
  icon: LucideIcon;
  path: string;
  group: MenuGroupId;
  externalHref?: string;
}

export const menuGroupLabels: Record<MenuGroupId, string> = {
  me: '我的',
  work: '业务',
  manage: '管理',
};

export const menuGroupOrder: MenuGroupId[] = ['me', 'work', 'manage'];

export const menuItems: MenuItem[] = [
  {
    title: '我的资料',
    icon: UserPen,
    path: '',
    group: 'me',
  },
  {
    title: '我的流程',
    icon: Workflow,
    path: '/user-flow',
    group: 'me',
  },
  {
    title: '试卷批改',
    icon: FilePenLine,
    path: '/review',
    group: 'work',
  },
  {
    title: '用户管理',
    icon: Users,
    path: '/manage',
    group: 'manage',
  },
  {
    title: '成绩管理',
    icon: ArrowDownWideNarrow,
    path: '/recruitment',
    group: 'work',
  },
  {
    title: '邮件中心',
    icon: Mail,
    path: '/emails',
    group: 'work',
  },
  {
    title: '流程管理',
    icon: SquareChartGantt,
    path: '/flow',
    group: 'manage',
  },
  {
    title: '面评审批',
    icon: ClipboardCheck,
    path: '/approvals',
    group: 'work',
  },
  {
    title: '操作审计',
    icon: ScrollText,
    path: '/audit',
    group: 'manage',
  },
  {
    title: '错误日志',
    icon: FileWarning,
    path: '/error-log',
    group: 'manage',
    externalHref: SENTRY_ISSUES_URL,
  },
];

export function isItemActive(pathname: string, itemPath: string): boolean {
  if (!itemPath) return pathname === '/dashboard';
  return pathname.includes(`/dashboard${itemPath}`);
}

export function getMenuItemTitle(item: MenuItem, role?: number): string {
  if (item.path === '/manage' && role === 2) return '成员目录';
  return item.title;
}

export function getVisibleMenuItems(role: number): MenuItem[] {
  if (role === 0 || role === 1) {
    return menuItems.filter((item) => item.group === 'me');
  }
  if (role === 2) {
    return menuItems.filter(
      (item) =>
        item.group === 'me' ||
        item.path === '/review' ||
        item.path === '/manage' ||
        item.path === '/recruitment',
    );
  }
  return menuItems;
}

export function getMenuGroups(
  role: number,
): Array<{ id: MenuGroupId; label: string; items: MenuItem[] }> {
  const visible = getVisibleMenuItems(role);
  return menuGroupOrder
    .map((id) => ({
      id,
      label: menuGroupLabels[id],
      items: visible.filter((item) => item.group === id),
    }))
    .filter((group) => group.items.length > 0);
}

function useCurrentMenuItem() {
  const pathname = usePathname();
  return menuItems.find(
    (item) =>
      (!item.path && pathname === '/dashboard') ||
      (item.path && pathname.includes(`/dashboard${item.path}`)),
  );
}

/**
 * Top-bar location chrome.
 * Shows the real current module (and parent group when useful).
 * No fake "首页" that aliases to 我的资料.
 */
export const PageBreadcrumb = ({ role }: { role?: number }) => {
  const currentItem = useCurrentMenuItem();
  const title = currentItem
    ? getMenuItemTitle(currentItem, role)
    : '工作台';
  // Personal section is already self-explanatory; show group only for 业务/管理.
  const showGroup = Boolean(currentItem && currentItem.group !== 'me');

  return (
    <Breadcrumb>
      <BreadcrumbList>
        {showGroup && currentItem ? (
          <>
            <BreadcrumbItem className="hidden sm:inline-flex">
              <span className="text-muted-foreground">
                {menuGroupLabels[currentItem.group]}
              </span>
            </BreadcrumbItem>
            <BreadcrumbSeparator className="hidden sm:block" />
          </>
        ) : null}
        <BreadcrumbItem>
          <BreadcrumbPage className="max-w-[12rem] truncate font-medium text-foreground sm:max-w-[16rem]">
            {title}
          </BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  );
};

export const PageTitle = ({
  role,
  className,
}: {
  role?: number;
  className?: string;
}) => {
  const currentItem = useCurrentMenuItem();

  return (
    <h1 className={cn('min-w-0 text-xl font-bold md:text-2xl', className)}>
      {currentItem ? getMenuItemTitle(currentItem, role) : '工作台'}
    </h1>
  );
};

/** Responsive page header: stacks title/actions on small screens. */
export function PageHeader({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between',
        className,
      )}
    >
      {children}
    </div>
  );
}
