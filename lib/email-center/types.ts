import type { InterviewScheduleEmailVariables } from "@/lib/email/interview-schedule";
import type { ResultEmailTemplateSetting } from "@/lib/email/template-settings";

export type EmailCategory = "result" | "interview" | "test";

export type ResultEmailTemplateKey =
  | "recruitment.result.accepted"
  | "recruitment.result.rejected";

export type InterviewEmailTemplateKey =
  | "interview.schedule.created"
  | "interview.schedule.rescheduled"
  | "interview.schedule.cancelled";

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

export type InterviewEmailRenderVariables = Omit<
  InterviewScheduleEmailVariables,
  "kind"
>;

export type EmailTemplateRenderRequest =
  | {
      templateKey: ResultEmailTemplateKey;
      variables: ResultEmailRenderVariables;
    }
  | {
      templateKey: InterviewEmailTemplateKey;
      variables: InterviewEmailRenderVariables;
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
