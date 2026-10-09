import { verifyRole } from "@/lib/dal";
import { MANAGER_ROLE } from "@/lib/link/role";
import { redirect } from "next/navigation";

/**
 * 大屏独立于 `/dashboard` 外壳：不渲染侧边栏/顶栏，整屏展示。
 * 所有部长（role ≥ 3）都能打开并常驻；未登录回登录页。
 */
export default async function QueueBoardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await verifyRole(MANAGER_ROLE).catch(() => null);
  if (!session) redirect("/login");
  return children;
}
