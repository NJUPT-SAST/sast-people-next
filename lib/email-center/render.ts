import "server-only";

import {
  renderInterviewScheduleEmail,
  renderInterviewScheduleEmailSubject,
} from "@/lib/email/interview-schedule";
import {
  renderResultEmail,
  renderResultEmailSubject,
} from "@/lib/email/result-email";
import { getEmailTemplateDefinition } from "@/lib/email-center/registry";
import type {
  EmailTemplateDefinition,
  EmailTemplateRenderRequest,
  InterviewEmailTemplateKey,
  RenderedEmail,
} from "@/lib/email-center/types";

function getInterviewEmailKind(templateKey: InterviewEmailTemplateKey) {
  if (templateKey === "interview.schedule.rescheduled") return "rescheduled";
  if (templateKey === "interview.schedule.cancelled") return "cancelled";
  return "created";
}

function hasRequiredVariableValue(value: unknown) {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  return true;
}

function validateEmailTemplateVariables(
  definition: EmailTemplateDefinition,
  variables: Record<string, unknown>,
) {
  const missingVariables = definition.variables
    .filter(
      (variable) =>
        variable.required && !hasRequiredVariableValue(variables[variable.key]),
    )
    .map((variable) => variable.label);

  if (missingVariables.length > 0) {
    throw new Error(
      `邮件模板「${definition.name}」缺少必填变量：${missingVariables.join("、")}`,
    );
  }
}

export async function renderEmailTemplate(
  request: EmailTemplateRenderRequest,
): Promise<RenderedEmail> {
  const definition = getEmailTemplateDefinition(request.templateKey);
  if (!definition) {
    throw new Error(`Unknown email template: ${request.templateKey}`);
  }
  validateEmailTemplateVariables(
    definition,
    request.variables as Record<string, unknown>,
  );

  switch (request.templateKey) {
    case "recruitment.result.accepted":
      return {
        subject: renderResultEmailSubject(
          request.variables.flowName,
          request.variables.setting,
        ),
        html: await renderResultEmail({
          ...request.variables,
          accept: true,
        }),
      };
    case "recruitment.result.rejected":
      return {
        subject: renderResultEmailSubject(
          request.variables.flowName,
          request.variables.setting,
        ),
        html: await renderResultEmail({
          ...request.variables,
          accept: false,
        }),
      };
    case "interview.schedule.created":
    case "interview.schedule.rescheduled":
    case "interview.schedule.cancelled": {
      const kind = getInterviewEmailKind(request.templateKey);
      return {
        subject: await renderInterviewScheduleEmailSubject(
          request.variables.flowName,
          kind,
        ),
        html: await renderInterviewScheduleEmail({
          ...request.variables,
          kind,
        }),
      };
    }
  }
}
