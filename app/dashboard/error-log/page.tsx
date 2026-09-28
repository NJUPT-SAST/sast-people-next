import { verifyAdmin } from "@/lib/authz";
import { SENTRY_ISSUES_URL } from "@/lib/sentry";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

const ErrorLogPage = async () => {
  await verifyAdmin();
  redirect(SENTRY_ISSUES_URL);
};

export default ErrorLogPage;
