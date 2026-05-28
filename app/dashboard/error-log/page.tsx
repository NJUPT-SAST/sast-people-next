import { verifyRole } from "@/lib/dal";
import { SENTRY_ISSUES_URL } from "@/lib/sentry";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

const ErrorLogPage = async () => {
  await verifyRole(3);
  redirect(SENTRY_ISSUES_URL);
};

export default ErrorLogPage;
