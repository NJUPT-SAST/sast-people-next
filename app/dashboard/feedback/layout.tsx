import { verifyAdmin } from "@/lib/authz";
import { redirect } from "next/navigation";

const FeedbackLayout = async ({ children }: { children: React.ReactNode }) => {
  const session = await verifyAdmin().catch(() => null);
  if (!session) redirect("/dashboard");
  return <>{children}</>;
};

export default FeedbackLayout;
