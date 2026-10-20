import "server-only";

import { render } from "@react-email/render";
import InterviewScheduleEmail from "@/emails/interview-schedule";
import { getPeopleUrl } from "@/lib/app-url";
import type { EmailBlock, EmailFrameStyle } from "@/lib/email/blocks";
import {
  getInterviewWithdrawalTemplateSetting,
  renderInterviewWithdrawalTemplateText,
  type InterviewScheduleTemplateSetting,
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
  3: "部长",
  4: "管理员",
};

/** Falls back to 讲师, since returning a candidate is an interviewer action. */
export function getWithdrawalOperatorLabel(role?: number) {
  return (role !== undefined && operatorRoleLabels[role]) || "讲师";
}

export async function renderInterviewWithdrawalEmailSubject({
  candidateName,
  flowName,
  reason,
  operatorName,
  department,
}: InterviewWithdrawalEmailVariables & { department?: string | null }) {
  const setting = await getInterviewWithdrawalTemplateSetting(department);
  /* 与正文同口径：标题里的 {candidateName} / {reason} / {organizerName} 必须是真实值 */
  return renderInterviewWithdrawalTemplateText(setting.subjectTemplate, {
    candidateName,
    flowName,
    reason,
    organizerName: operatorName ?? "",
  });
}

export async function renderInterviewWithdrawalEmail({
  candidateName,
  flowName,
  reason,
  operatorName,
  operatorRole,
  flowUrl = getPeopleUrl("/dashboard/user-flow"),
  department,
  blocks,
  frame,
  themeColor,
  /* 已解析的模板设置：预览「编辑中的草稿」时传入，缺省按部门解析 */
  setting: resolvedSetting,
}: InterviewWithdrawalEmailVariables & {
  department?: string | null;
  /** 正文区块：为空时回落到模板设置，模板也没自定义则用内置版式 */
  blocks?: EmailBlock[];
  /** 邮件外框：为空时回落到模板设置的内置外观 */
  frame?: EmailFrameStyle;
  /** 主题色（#RRGGBB）：空值 = 沿用面试邮件的中性灰 */
  themeColor?: string;
  setting?: InterviewScheduleTemplateSetting;
}) {
  const setting =
    resolvedSetting ?? (await getInterviewWithdrawalTemplateSetting(department));
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
      blocks={blocks ?? setting.bodyBlocks ?? undefined}
      frame={frame ?? setting.bodyFrame ?? undefined}
      themeColor={themeColor ?? setting.themeColor}
    />,
  );
}

export async function renderInterviewWithdrawalEmailPreview(
  department?: string | null,
  /* 编辑中的草稿：盖在解析出的模板设置上，用于实时预览还没保存的版式 / 主题色 */
  override?: Partial<InterviewScheduleTemplateSetting>,
) {
  const setting = {
    ...(await getInterviewWithdrawalTemplateSetting(department)),
    ...override,
  };

  return renderInterviewWithdrawalEmail({
    candidateName: "张三",
    flowName: "2026 校科协软件研发部 免试招新",
    reason: "请补充作品集后重新报名。",
    operatorName: "李四",
    operatorRole: 2,
    department,
    setting,
  });
}
