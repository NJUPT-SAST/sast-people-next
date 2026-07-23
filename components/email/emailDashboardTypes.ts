export type EmailBatch = Awaited<
  ReturnType<typeof import("@/action/email/list").listEmailBatches>
>[number];

export type EmailDeliveryRecord = Awaited<
  ReturnType<typeof import("@/action/email/list").listEmailDeliveryPage>
>["deliveries"][number];

export type EmailDeliveryPage = Awaited<
  ReturnType<typeof import("@/action/email/list").listEmailDeliveryPage>
>;

export type FlowTarget = Awaited<
  ReturnType<typeof import("@/action/email/workspace").listEmailFlowTargets>
>[number];

export type TemplateSetting = Awaited<
  ReturnType<typeof import("@/action/email/template").listEmailTemplateSettings>
>[number];

export type InterviewScheduleTemplate = Awaited<
  ReturnType<typeof import("@/action/email/interview-template").getInterviewScheduleEmailTemplate>
>;

export type InterviewScheduleTemplates = Awaited<
  ReturnType<typeof import("@/action/email/interview-template").listInterviewScheduleEmailTemplates>
>;

export type InterviewSchedulePreviews = Awaited<
  ReturnType<typeof import("@/action/email/interview-template").getInterviewScheduleEmailPreviews>
>;

export type ResultEmailPreviews = Awaited<
  ReturnType<typeof import("@/action/email/template").getResultEmailPreviews>
>;

export type EmailTemplateDefinition =
  import("@/lib/email-center/types").EmailTemplateDefinition;

export type EmailCenterConfig = {
  smtpConfigured: boolean;
  smtpHost: string;
  sender: string;
  testRecipient: string;
  queueStatus: string;
  realRecipientMode: boolean;
  retryMaxAttempts: number;
  retryBaseDelaySeconds: number;
  retryMaxDelaySeconds: number;
  retryScanLimit: number;
  sendRateLimitPerMinute: number;
  attemptRetentionDays: number;
  webhookConfigured: boolean;
  readinessChecks: Array<{
    key: string;
    label: string;
    status: "pass" | "warn" | "fail";
    detail: string;
  }>;
};
