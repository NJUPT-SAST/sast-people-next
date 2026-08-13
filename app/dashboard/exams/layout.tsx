import { verifyRole } from "@/lib/dal";
import { redirect } from "next/navigation";

export default async function ExamsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await verifyRole(2).catch(() => null);
  if (!session) redirect("/dashboard");
  return children;
}
