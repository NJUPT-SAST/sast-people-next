import { verifyAdmin } from "@/lib/authz";
import { isNextControlFlowError } from "@/lib/server-error-log";
import { redirect } from "next/navigation";

const DepartmentsLayout = async ({ children }: { children: React.ReactNode }) => {
  try {
    await verifyAdmin();
  } catch (error) {
    /* 未登录时 verifySession 会先 redirect('/login')，控制流错误不能吞掉 */
    if (isNextControlFlowError(error)) throw error;
    redirect("/dashboard");
  }

  return <>{children}</>;
};

export default DepartmentsLayout;
