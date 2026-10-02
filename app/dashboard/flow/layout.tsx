import { verifyManager } from "@/lib/authz";
import { redirect } from "next/navigation";

const FlowLayout = async ({ children }: { children: React.ReactNode }) => {
  /* 严格模式：无部门归属的账号看不到任何部门数据，直接回控制台 */
  const session = await verifyManager().catch(() => null);
  if (!session) redirect("/dashboard");
  return <>{children}</>;
};

export default FlowLayout;
