import "server-only";

import {
  renderInterviewScheduleEmail,
  renderInterviewScheduleEmailSubject,
} from "@/lib/email/interview-schedule";
import {
  renderInterviewWithdrawalEmail,
  renderInterviewWithdrawalEmailSubject,
} from "@/lib/email-center/interview-withdrawal";
import {
  renderResultEmail,
  renderResultEmailSubject,
  type ResultEmailFlowKind,
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
  if (templateKey === "interview.schedule.change.rejected") {
    return "change_rejected";
  }
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
    case "recruitment.result.rejected":
    case "woc.result.accepted":
    case "woc.result.rejected":
    case "soc.result.accepted":
    case "soc.result.rejected":
    case "office_round1.result.accepted":
    case "office_round1.result.rejected":
    case "office_round2.result.accepted":
    case "office_round2.result.rejected": {
      const [flowKind, , resultKind] = request.templateKey.split(".");
      return {
        subject: renderResultEmailSubject(
          {
            name: request.variables.name,
            flowName: request.variables.flowName,
            department: request.variables.department,
            groupNumber: request.variables.groupNumber,
          },
          request.variables.setting,
        ),
        html: await renderResultEmail({
          ...request.variables,
          accept: resultKind === "accepted",
          flowKind: flowKind as ResultEmailFlowKind,
        }),
      };
    }
    case "interview.schedule.created":
    case "interview.schedule.rescheduled":
    case "interview.schedule.cancelled":
    case "interview.schedule.change.rejected": {
      const kind = getInterviewEmailKind(request.templateKey);
      return {
        subject: await renderInterviewScheduleEmailSubject(
          request.variables.flowName,
          kind,
          request.department,
        ),
        html: await renderInterviewScheduleEmail({
          ...request.variables,
          kind,
          department: request.department,
        }),
      };
    }
    case "interview.application.withdrawn":
      return {
        subject: await renderInterviewWithdrawalEmailSubject(
          request.variables.flowName,
          request.department,
        ),
        html: await renderInterviewWithdrawalEmail({
          ...request.variables,
          department: request.department,
        }),
      };
  }
}
