import { RecruitmentWorkspacePage } from "@/components/recruitment/recruitmentWorkspacePage";

export default function ExamsPage({
  searchParams,
}: {
  searchParams: Promise<{
    flowId?: string;
    userFlowId?: string;
  }>;
}) {
  return <RecruitmentWorkspacePage mode="written" searchParams={searchParams} />;
}
