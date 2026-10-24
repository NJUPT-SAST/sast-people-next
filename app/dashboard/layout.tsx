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
  /* verifySession 已在本请求内回写并重读会话，展示字段直接复用它，避免再打一次 people_session */
  const role = session.role;
  const displayDepartment = session.department;
  const realRole = session.realRole;
  const viewAs = session.viewAs ?? null;
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
