import "server-only";

import { render } from "@react-email/render";
import OfferEmail from "@/emails/offer";
import { isOfficeInterviewFlow } from "@/const/flow";
import {
  defaultResultEmailTemplateSettings,
  renderTemplateText,
  type ResultEmailTemplateSetting,
} from "@/lib/email/template-settings";

export type ResultEmailKind = "accepted" | "rejected";
export type ResultEmailFlowKind =
  | "recruitment"
  | "woc"
  | "soc"
  | "office_round1"
  | "office_round2";

export type ResultEmailVariables = {
  name: string;
  flowName: string;
  accept: boolean;
  flowKind?: ResultEmailFlowKind;
  /** 办公类部门面试轮次：1 = 一轮，2 = 二轮（其他流程为空） */
  round?: number | null;
  /** 候选人所报部门展示名：办公类部门面试通知的 {department} 变量 */
  department?: string;
  /** 后续 QQ 群号：办公类部门面试通知的 {groupNumber} 变量 */
  groupNumber?: string;
  setting?: ResultEmailTemplateSetting;
  genericGreeting?: boolean;
};

export function getResultEmailKind(accept: boolean): ResultEmailKind {
  return accept ? "accepted" : "rejected";
}

/** 结果模板键统一按「流程类型 + 轮次 + 通过与否」解析；办公类按轮次拆成两套模板 */
export function getResultEmailTemplateKey(
  flowType: string,
  accept: boolean,
  round?: number | null,
): `${ResultEmailFlowKind}.result.${ResultEmailKind}` {
  return `${getResultEmailFlowKind(flowType, round)}.result.${getResultEmailKind(accept)}`;
}

export function getResultEmailFlowKind(
  flowType: string,
  round?: number | null,
): ResultEmailFlowKind {
  if (isOfficeInterviewFlow(flowType)) {
    return round === 2 ? "office_round2" : "office_round1";
  }
  /* 已解析过的 kind 原样返回，调用方重复带入也不会降级成默认值 */
  if (flowType === "office_round1" || flowType === "office_round2") {
    return flowType;
  }
  if (flowType === "woc") return "woc";
  if (flowType === "soc") return "soc";
  return "recruitment";
}

export function getResultEmailSubject(flowName: string) {
  return renderTemplateText("{flowName} 结果通知", { flowName });
}

export async function renderResultEmail({
  name,
  flowName,
  accept,
  flowKind = "recruitment",
  round = null,
  department = "",
  groupNumber = "",
  setting,
  genericGreeting = false,
}: ResultEmailVariables) {
  const resolvedSetting =
    setting ??
    defaultResultEmailTemplateSettings.find(
      (item) => item.templateKey === getResultEmailTemplateKey(flowKind, accept, round),
    )!;

  return render(
    <OfferEmail
      name={name}
      flowName={flowName}
      accept={accept}
      flowKind={flowKind}
      department={department}
      groupNumber={groupNumber}
      bodyTemplate={resolvedSetting.bodyTemplate}
      titleTemplate={resolvedSetting.titleTemplate}
      subtitleTemplate={resolvedSetting.subtitleTemplate}
      resultBadgeTemplate={resolvedSetting.resultBadgeTemplate}
      resultTitleTemplate={resolvedSetting.resultTitleTemplate}
      resultSummaryTemplate={resolvedSetting.resultSummaryTemplate}
      genericGreeting={genericGreeting}
      memberInfoFormUrl={resolvedSetting.memberInfoFormUrl}
      feishuGroupUrl={resolvedSetting.feishuGroupUrl}
      calendarUrl={resolvedSetting.calendarUrl}
      feishuRegisterHelpUrl={resolvedSetting.feishuRegisterHelpUrl}
      contactEmail={resolvedSetting.contactEmail}
      memberFormLabel={resolvedSetting.memberFormLabel}
      feishuGroupName={resolvedSetting.feishuGroupName}
    />,
  );
}

/** 结果邮件标题变量：与 registry 的结果模板变量保持一致，未知占位符渲染为空 */
export type ResultEmailSubjectVariables = {
  name?: string;
  flowName: string;
  department?: string;
  groupNumber?: string;
};

export function renderResultEmailSubject(
  variables: ResultEmailSubjectVariables,
  setting?: ResultEmailTemplateSetting,
) {
  return renderTemplateText(setting?.subjectTemplate ?? "{flowName} 结果通知", {
    name: variables.name ?? "",
    flowName: variables.flowName,
    department: variables.department ?? "",
    groupNumber: variables.groupNumber ?? "",
  });
}
