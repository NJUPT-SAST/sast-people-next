import "server-only";

import { render } from "@react-email/render";
import OfferEmail from "@/emails/offer";
import {
  defaultResultEmailTemplateSettings,
  renderTemplateText,
  type ResultEmailTemplateSetting,
} from "@/lib/email/template-settings";

export type ResultEmailKind = "accepted" | "rejected";
export type ResultEmailFlowKind = "recruitment" | "woc" | "soc";

export type ResultEmailVariables = {
  name: string;
  flowName: string;
  accept: boolean;
  flowKind?: ResultEmailFlowKind;
  setting?: ResultEmailTemplateSetting;
  genericGreeting?: boolean;
};

export function getResultEmailKind(accept: boolean): ResultEmailKind {
  return accept ? "accepted" : "rejected";
}

export function getResultEmailTemplateKey(
  flowTypeOrAccept: string | boolean,
  acceptArg?: boolean,
): `${ResultEmailFlowKind}.result.${ResultEmailKind}` {
  const flowType = typeof flowTypeOrAccept === "string" ? flowTypeOrAccept : "recruitment";
  const accept = typeof flowTypeOrAccept === "boolean" ? flowTypeOrAccept : Boolean(acceptArg);
  return `${getResultEmailFlowKind(flowType)}.result.${getResultEmailKind(accept)}`;
}

export function getResultEmailFlowKind(flowType: string): ResultEmailFlowKind {
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
  setting,
  genericGreeting = false,
}: ResultEmailVariables) {
  const resolvedSetting =
    setting ??
    defaultResultEmailTemplateSettings.find(
      (item) => item.templateKey === getResultEmailTemplateKey(flowKind, accept),
    )!;

  return render(
    <OfferEmail
      name={name}
      flowName={flowName}
      accept={accept}
      flowKind={flowKind}
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

export function renderResultEmailSubject(
  flowName: string,
  setting?: ResultEmailTemplateSetting,
) {
  return renderTemplateText(setting?.subjectTemplate ?? "{flowName} 结果通知", {
    flowName,
  });
}
