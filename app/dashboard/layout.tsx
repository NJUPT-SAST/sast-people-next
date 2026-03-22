import type { Metadata } from 'next';
import { verifySession } from '@/lib/dal';
import { Suspense } from 'react';
import { Loading } from '@/components/loading';
import { UserCard } from '@/components/userCard';
import { DashboardLayout } from '@/components/dashboard-layout';
import { PageBreadcrumb } from '@/components/route';

export const metadata: Metadata = {
  title: 'SAST 招新',
  description: '南京邮电大学大学生科学技术协会招新平台',
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await verifySession();
  return (
    <DashboardLayout
      role={session.role}
      userCard={<UserCard />}
      breadcrumb={<PageBreadcrumb />}
    >
      <Suspense fallback={<Loading />}>{children}</Suspense>
    </DashboardLayout>
  );
}
