import "server-only";

import { render } from "@react-email/components";
import OfferEmail from "@/emails/offer";
import {
  defaultResultEmailTemplateSettings,
  renderTemplateText,
  type ResultEmailTemplateSetting,
} from "@/lib/email/template-settings";

export type ResultEmailKind = "accepted" | "rejected";

export type ResultEmailVariables = {
  name: string;
  flowName: string;
  accept: boolean;
  setting?: ResultEmailTemplateSetting;
  genericGreeting?: boolean;
};

export function getResultEmailKind(accept: boolean): ResultEmailKind {
  return accept ? "accepted" : "rejected";
}

export function getResultEmailTemplateKey(accept: boolean) {
  return `recruitment.result.${getResultEmailKind(accept)}`;
}

export function getResultEmailSubject(flowName: string) {
  return renderTemplateText("{flowName} 结果通知", { flowName });
}

export async function renderResultEmail({
  name,
  flowName,
  accept,
  setting,
  genericGreeting = false,
}: ResultEmailVariables) {
  const resolvedSetting =
    setting ??
    defaultResultEmailTemplateSettings.find(
      (item) => item.templateKey === getResultEmailTemplateKey(accept),
    )!;

  return render(
    <OfferEmail
      name={name}
      flowName={flowName}
      accept={accept}
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
