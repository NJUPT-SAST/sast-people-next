import type { InterviewScheduleEmailVariables } from "@/lib/email/interview-schedule";
import type { InterviewWithdrawalEmailVariables } from "@/lib/email-center/interview-withdrawal";
import type { ResultEmailTemplateSetting } from "@/lib/email/template-settings";

export type EmailCategory = "result" | "interview" | "test";

export type ResultEmailTemplateKey =
  | "recruitment.result.accepted"
  | "recruitment.result.rejected"
  | "recruitment_exemption.result.accepted"
  | "recruitment_exemption.result.rejected"
  | "woc.result.accepted"
  | "woc.result.rejected"
  | "soc.result.accepted"
  | "soc.result.rejected"
  | "office_round1.result.accepted"
  | "office_round1.result.rejected"
  | "office_round2.result.accepted"
  | "office_round2.result.rejected";

export type InterviewScheduleEmailTemplateKey =
  | "interview.schedule.created"
  | "interview.schedule.rescheduled"
  | "interview.schedule.cancelled"
  | "interview.schedule.change.rejected";

export type InterviewWithdrawalEmailTemplateKey = "interview.application.withdrawn";

export type InterviewEmailTemplateKey =
  | InterviewScheduleEmailTemplateKey
  | InterviewWithdrawalEmailTemplateKey;

export type EmailTemplateKey = ResultEmailTemplateKey | InterviewEmailTemplateKey;

export type EmailVariableDefinition = {
  key: string;
  label: string;
  required: boolean;
  example: string;
  description?: string;
};

export type EmailTemplateDefinition = {
  key: EmailTemplateKey;
  category: Exclude<EmailCategory, "test">;
  name: string;
  description: string;
  defaultSubject: string;
  variables: EmailVariableDefinition[];
};

export type RenderedEmail = {
  subject: string;
  html: string;
};

export type ResultEmailRenderVariables = {
  name: string;
  flowName: string;
  setting?: ResultEmailTemplateSetting;
  flowKind?:
    | "recruitment"
    | "recruitment_exemption"
    | "woc"
    | "soc"
    | "office_round1"
    | "office_round2";
  /** 办公类部门面试轮次：1 = 一轮，2 = 二轮 */
  round?: number | null;
  /** 候选人所报部门展示名（{department} 变量） */
  department?: string;
  /** 后续 QQ 群号（{groupNumber} 变量） */
  groupNumber?: string;
  genericGreeting?: boolean;
};

export type InterviewScheduleEmailRenderVariables = Omit<
  InterviewScheduleEmailVariables,
  "kind"
>;

export type InterviewEmailRenderVariables =
  | InterviewScheduleEmailRenderVariables
  | InterviewWithdrawalEmailVariables;

export type EmailTemplateRenderRequest = (
  | {
      templateKey: ResultEmailTemplateKey;
      variables: ResultEmailRenderVariables;
    }
  | {
      templateKey: InterviewScheduleEmailTemplateKey;
      variables: InterviewScheduleEmailRenderVariables;
    }
  | {
      templateKey: InterviewWithdrawalEmailTemplateKey;
      variables: InterviewWithdrawalEmailVariables;
    }
) & {
  /* 部门模板覆盖：渲染时按该部门解析模板，缺省用全局默认 */
  department?: string | null;
};

export type CreateRenderedEmailDeliveryInput = EmailTemplateRenderRequest & {
  toAddress: string;
  recipientUserId?: number | null;
  flowId?: number | null;
  batchId?: number | null;
  userFlowId?: number | null;
  relatedScheduleId?: number | null;
  createdBy?: number | null;
  metadata?: Record<string, unknown>;
  idempotencyKey?: string | null;
  sendImmediately?: boolean;
};

export type CreateRenderedTestEmailDeliveryInput = EmailTemplateRenderRequest & {
  toAddress: string;
  recipientUserId?: number | null;
  flowId?: number | null;
  createdBy: number;
  metadata?: Record<string, unknown>;
  idempotencyKey?: string | null;
  sendImmediately?: boolean;
};
