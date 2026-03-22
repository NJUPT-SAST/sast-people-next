'use client';
import { usePathname } from 'next/navigation';
import {
  UserPen,
  Workflow,
  FilePenLine,
  Users,
  ArrowDownWideNarrow,
  SquareChartGantt,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from './ui/breadcrumb';

export interface MenuItem {
  title: string;
  icon: LucideIcon;
  path: string;
}

export const menuItems: MenuItem[] = [
  {
    title: '我的资料',
    icon: UserPen,
    path: '',
  },
  {
    title: '我的流程',
    icon: Workflow,
    path: '/user-flow',
  },
  {
    title: '试卷批改',
    icon: FilePenLine,
    path: '/review',
  },
  {
    title: '用户管理',
    icon: Users,
    path: '/manage',
  },
  {
    title: '招新成绩',
    icon: ArrowDownWideNarrow,
    path: '/recruitment',
  },
  {
    title: '流程管理',
    icon: SquareChartGantt,
    path: '/flow',
  },
];

export function isItemActive(pathname: string, itemPath: string): boolean {
  if (!itemPath) return pathname === '/dashboard';
  return pathname.includes(`/dashboard${itemPath}`);
}

function useCurrentMenuItem() {
  const pathname = usePathname();
  return menuItems.find(
    (item) =>
      (!item.path && pathname === '/dashboard') ||
      (item.path && pathname.includes(`/dashboard${item.path}`))
  );
}

export const PageBreadcrumb = () => {
  const currentItem = useCurrentMenuItem();

  return (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink asChild>
            <Link href="/dashboard">首页</Link>
          </BreadcrumbLink>
        </BreadcrumbItem>
        {currentItem && currentItem.path && (
          <>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>{currentItem.title}</BreadcrumbPage>
            </BreadcrumbItem>
          </>
        )}
      </BreadcrumbList>
    </Breadcrumb>
  );
};

export const PageTitle = () => {
  const currentItem = useCurrentMenuItem();

  return (
    <h1 className="text-xl font-bold md:text-2xl">
      {currentItem?.title ?? '首页'}
    </h1>
  );
};
