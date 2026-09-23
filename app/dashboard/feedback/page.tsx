import { PageHeader, PageTitle } from "@/components/route";
import { FeedbackReports } from "@/components/manage/feedback-reports";
import { listFeedbackReports } from "@/action/feedback";

export const dynamic = "force-dynamic";

export default async function FeedbackPage() {
  const reports = await listFeedbackReports();
  return <><PageHeader><PageTitle /></PageHeader><FeedbackReports initialReports={reports} /></>;
}
