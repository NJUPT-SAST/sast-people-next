import { verifyRole } from "@/lib/dal";
import { MANAGER_ROLE } from "@/lib/link/role";
import { redirect } from "next/navigation";

/** 签到叫号：所有部长（role ≥ 3）都能进（场地是各办公部门共用的）。 */
export default async function CheckinLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await verifyRole(MANAGER_ROLE).catch(() => null);
  if (!session) redirect("/dashboard");
  return children;
}
