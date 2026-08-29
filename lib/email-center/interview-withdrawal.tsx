import "server-only";

import { render } from "@react-email/render";
import InterviewWithdrawalEmail from "@/emails/interview-withdrawal";
import { getPeopleUrl } from "@/lib/app-url";

export type InterviewWithdrawalEmailVariables = {
  candidateName: string;
  flowName: string;
  reason: string;
  flowUrl?: string;
};

export function renderInterviewWithdrawalEmailSubject(flowName: string) {
  return `${flowName} 面试报名退回通知`;
}

export async function renderInterviewWithdrawalEmail({
  candidateName,
  flowName,
  reason,
  flowUrl = getPeopleUrl("/dashboard/user-flow"),
}: InterviewWithdrawalEmailVariables) {
  return render(
    <InterviewWithdrawalEmail
      candidateName={candidateName}
      flowName={flowName}
      reason={reason}
      flowUrl={flowUrl}
    />,
  );
}

export async function renderInterviewWithdrawalEmailPreview() {
  return renderInterviewWithdrawalEmail({
    candidateName: "张三",
    flowName: "2026 免试招新 Demo",
    reason: "请补充作品集后重新报名。",
  });
}
