import { verifyRole } from "@/lib/dal";
import { redirect } from "next/navigation";

const ReviewLayout = async ({ children }: { children: React.ReactNode }) => {
  const session = await verifyRole(1).catch(() => null);
  if (!session) redirect("/dashboard");
  return <>{children}</>;
};

export default ReviewLayout;
