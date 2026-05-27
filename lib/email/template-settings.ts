import { resultEmailCopy, resultEmailLinks } from "@/lib/email/result-email-config";

export type ResultEmailTemplateSetting = {
  templateKey: string;
  subjectTemplate: string;
  memberInfoFormUrl: string;
  feishuGroupUrl: string;
  calendarUrl: string;
  feishuRegisterHelpUrl: string;
  contactEmail: string;
  memberFormLabel: string;
  feishuGroupName: string;
};

const baseSetting = {
  memberInfoFormUrl: resultEmailLinks.memberInfoForm,
  feishuGroupUrl: resultEmailLinks.feishuGroup,
  calendarUrl: resultEmailLinks.calendar,
  feishuRegisterHelpUrl: resultEmailLinks.feishuRegisterHelp,
  contactEmail: resultEmailCopy.contactEmail,
  memberFormLabel: resultEmailCopy.memberFormLabel,
  feishuGroupName: resultEmailCopy.feishuGroupName,
};

export const defaultResultEmailTemplateSettings: ResultEmailTemplateSetting[] = [
  {
    templateKey: "recruitment.result.accepted",
    subjectTemplate: "{flowName} 结果通知",
    ...baseSetting,
  },
  {
    templateKey: "recruitment.result.rejected",
    subjectTemplate: "{flowName} 结果通知",
    ...baseSetting,
  },
];

export function renderTemplateText(
  template: string,
  variables: Record<string, string>,
) {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => variables[key] ?? "");
}

