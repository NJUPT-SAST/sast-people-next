import { RecruitmentWorkspacePage } from "@/components/recruitment/recruitmentWorkspacePage";

export default function InterviewsPage({
  searchParams,
}: {
  searchParams: Promise<{
    flowId?: string;
    userFlowId?: string;
    scheduleId?: string;
  }>;
}) {
  return <RecruitmentWorkspacePage mode="interview" searchParams={searchParams} />;
}
