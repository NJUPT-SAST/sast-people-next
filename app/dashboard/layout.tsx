import type { Metadata } from "next";
import { verifySession } from "@/lib/dal";
import { useUserInfo as getUserInfo } from "@/hooks/useUserInfo";
import { shouldUseMockLink } from "@/lib/link/client";
import { getSession, syncCurrentSessionIdentity } from "@/lib/session";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Loading } from "@/components/loading";
import { UserCard } from "@/components/userCard";
import { DashboardLayout } from "@/components/dashboard-layout";
import { PageBreadcrumb } from "@/components/route";

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
  const userInfo = await getUserInfo();
  /* 每次进入工作台回源 Link 资料，保证授权判定跟随 Link 的最新角色与部门 */
  await syncCurrentSessionIdentity({
    role: userInfo.role ?? session.role,
    department: userInfo.departments[0] ?? null,
  });
  /* verifySession 的请求缓存早于上面的同步，展示与判定都读回同步后的会话 */
  const latestSession = await getSession();
  const role = latestSession?.role ?? session.role;
  const displayDepartment = latestSession?.department ?? null;
  const sessionWithTokens = role >= 2
    ? await getSession({ includeLinkTokens: true })
    : null;
  if (
    role >= 2 &&
    !shouldUseMockLink() &&
    !sessionWithTokens?.linkAdminAccessToken
  ) {
    redirect('/api/auth/link/start');
  }
  return (
    <DashboardLayout
      role={role}
      department={displayDepartment}
      userCard={<UserCard />}
      breadcrumb={<PageBreadcrumb role={session.role} />}
    >
      <Suspense fallback={<Loading />}>{children}</Suspense>
    </DashboardLayout>
  );
}
