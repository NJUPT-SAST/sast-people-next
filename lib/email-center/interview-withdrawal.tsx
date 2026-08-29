import "server-only";

import { render } from "@react-email/render";
import InterviewScheduleEmail from "@/emails/interview-schedule";
import { getPeopleUrl } from "@/lib/app-url";
import {
  getInterviewWithdrawalTemplateSetting,
  renderInterviewWithdrawalTemplateText,
} from "@/lib/email/interview-template-settings";

export type InterviewWithdrawalEmailVariables = {
  candidateName: string;
  flowName: string;
  reason: string;
  flowUrl?: string;
};

export async function renderInterviewWithdrawalEmailSubject(flowName: string) {
  const setting = await getInterviewWithdrawalTemplateSetting();
  return renderInterviewWithdrawalTemplateText(setting.subjectTemplate, {
    candidateName: "同学",
    flowName,
    reason: "",
  });
}

export async function renderInterviewWithdrawalEmail({
  candidateName,
  flowName,
  reason,
  flowUrl = getPeopleUrl("/dashboard/user-flow"),
}: InterviewWithdrawalEmailVariables) {
  const setting = await getInterviewWithdrawalTemplateSetting();
  const variables = { candidateName, flowName, reason };

  return render(
    <InterviewScheduleEmail
      kind="withdrawn"
      candidateName={candidateName}
      flowName={flowName}
      reason={reason}
      flowUrl={flowUrl}
      titleText={renderInterviewWithdrawalTemplateText(setting.titleTemplate, variables)}
      bodyText={renderInterviewWithdrawalTemplateText(setting.bodyTemplate, variables)}
      footerText={setting.footerText}
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
