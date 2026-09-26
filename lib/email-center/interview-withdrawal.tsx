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
  /**
   * Who issued the withdrawal, rendered the way an appointment renders its
   * organiser, so the candidate knows who to go back to.
   */
  operatorName?: string;
  operatorRole?: number;
  flowUrl?: string;
};

const operatorRoleLabels: Record<number, string> = {
  2: "讲师",
  3: "管理员",
};

/** Falls back to 讲师, since returning a candidate is an interviewer action. */
export function getWithdrawalOperatorLabel(role?: number) {
  return (role !== undefined && operatorRoleLabels[role]) || "讲师";
}

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
  operatorName,
  operatorRole,
  flowUrl = getPeopleUrl("/dashboard/user-flow"),
}: InterviewWithdrawalEmailVariables) {
  const setting = await getInterviewWithdrawalTemplateSetting();
  // `organizerName` is part of the shared variable list, so a template saved
  // before this change may already reference it. Supply it so the placeholder
  // resolves instead of rendering blank.
  const variables = {
    candidateName,
    flowName,
    reason,
    organizerName: operatorName ?? "",
  };

  return render(
    <InterviewScheduleEmail
      kind="withdrawn"
      candidateName={candidateName}
      flowName={flowName}
      reason={reason}
      organizerName={operatorName}
      organizerLabel={getWithdrawalOperatorLabel(operatorRole)}
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
    operatorName: "李四",
    operatorRole: 2,
  });
}
