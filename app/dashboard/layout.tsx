import type { Metadata } from 'next';
import { verifySession } from '@/lib/dal';
import { shouldUseMockLink } from '@/lib/link/client';
import { getSession } from '@/lib/session';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { Loading } from '@/components/loading';
import { UserCard } from '@/components/userCard';
import { DashboardLayout } from '@/components/dashboard-layout';
import { PageBreadcrumb } from '@/components/route';

export const metadata: Metadata = {
  title: 'SAST People',
  description: '南京邮电大学大学生科学技术协会成员与组织平台',
};

export const dynamic = 'force-dynamic';

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await verifySession();
  const sessionWithTokens = session.role >= 2
    ? await getSession({ includeLinkTokens: true })
    : null;
  if (
    session.role >= 2 &&
    !shouldUseMockLink() &&
    !sessionWithTokens?.linkAdminAccessToken
  ) {
    redirect('/api/auth/link/start');
  }
  return (
    <DashboardLayout
      role={session.role}
      userCard={<UserCard />}
      breadcrumb={<PageBreadcrumb role={session.role} />}
    >
      <Suspense fallback={<Loading />}>{children}</Suspense>
    </DashboardLayout>
  );
}
