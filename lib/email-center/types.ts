import type { InterviewScheduleEmailVariables } from "@/lib/email/interview-schedule";
import type { InterviewWithdrawalEmailVariables } from "@/lib/email-center/interview-withdrawal";
import type { ResultEmailTemplateSetting } from "@/lib/email/template-settings";

export type EmailCategory = "result" | "interview" | "test";

export type ResultEmailTemplateKey =
  | "recruitment.result.accepted"
  | "recruitment.result.rejected";

export type InterviewScheduleEmailTemplateKey =
  | "interview.schedule.created"
  | "interview.schedule.rescheduled"
  | "interview.schedule.cancelled";

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
  genericGreeting?: boolean;
};

export type InterviewScheduleEmailRenderVariables = Omit<
  InterviewScheduleEmailVariables,
  "kind"
>;

export type InterviewEmailRenderVariables =
  | InterviewScheduleEmailRenderVariables
  | InterviewWithdrawalEmailVariables;

export type EmailTemplateRenderRequest =
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
