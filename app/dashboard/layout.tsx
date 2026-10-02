import type { Metadata } from "next";
import { verifySession } from "@/lib/dal";
import { useUserInfo as getUserInfo } from "@/hooks/useUserInfo";
import { shouldUseMockLink } from "@/lib/link/client";
import { getSession } from "@/lib/session";
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
  /* 身份回源已挪到 verifySession 内按 TTL 执行；这里保留 useUserInfo 只为它的
     Link token 缺失 / 失效跳转，返回值不再参与同步。 */
  await getUserInfo();
  /* verifySession 内部已按 TTL 回源 Link 身份；这里再读一次会话，
     拿最新的部门与临时视角用于展示（verifySession 是请求级缓存，展示口径单独取） */
  const latestSession = await getSession();
  const role = latestSession?.role ?? session.role;
  const displayDepartment = latestSession?.department ?? null;
  const realRole = latestSession?.realRole ?? session.realRole;
  const viewAs = latestSession?.viewAs ?? null;
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
      realRole={realRole}
      viewAs={viewAs}
      userCard={<UserCard />}
      breadcrumb={<PageBreadcrumb role={role} />}
    >
      <Suspense fallback={<Loading />}>{children}</Suspense>
    </DashboardLayout>
  );
}
