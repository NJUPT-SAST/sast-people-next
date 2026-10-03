import "server-only";

import { readResultEmailTemplateSetting } from "@/lib/email-center/template-resolution";
import { getEmailTemplateDefinition } from "@/lib/email-center/registry";
import { getResultEmailFlowKind } from "@/lib/email/result-email";
import { departmentLabel } from "@/const/department";
import type {
  EmailTemplateKey,
  EmailTemplateRenderRequest,
  InterviewScheduleEmailTemplateKey,
  ResultEmailTemplateKey,
} from "@/lib/email-center/types";

/**
 * 「测试发送」的渲染请求构造：只有这里用示例数据填充「候选人 / 流程 / 时间」这类
 * 每封信都不同的变量，**模板自身的设置（正文、群号、链接、按钮文案）一律取落库值**。
 * 因此它必须与真实发送走同一个 `readResultEmailTemplateSetting` 解析结果——
 * 曾经把 `groupNumber` 写死成示例值，导致填了 QQ 群号却在测试邮件里看不到。
 */
export type TestRenderRequestInput = {
  templateKey: EmailTemplateKey;
  flowName: string;
  name: string;
  operatorName: string;
  operatorRole: number;
  department: string | null;
};

export async function createTestRenderRequest({
  templateKey,
  flowName,
  name,
  operatorName,
  operatorRole,
  department,
}: TestRenderRequestInput): Promise<EmailTemplateRenderRequest> {
  if (getEmailTemplateDefinition(templateKey)?.category === "result") {
    /* 内部读取：写入目标已由 resolveTemplateEditTarget 校验，这里不需要再走 action */
    const setting = await readResultEmailTemplateSetting(templateKey, department);
    const [flowKind] = templateKey.split(".");
    /* 办公类模板按轮次区分；测试发送沿用模板键里的轮次 */
    const round =
      flowKind === "office_round2" ? 2 : flowKind === "office_round1" ? 1 : null;
    return {
      templateKey: templateKey as ResultEmailTemplateKey,
      variables: {
        name,
        flowName,
        round,
        department: departmentLabel(department, "办公室"),
        /* 群号来自模板设置：示例值只在没填时兜底，避免测试邮件看起来「没生效」 */
        groupNumber: setting.groupNumber,
        setting,
        flowKind: getResultEmailFlowKind(flowKind, round),
        genericGreeting: false,
      },
      department,
    };
  }

  if (templateKey === "interview.application.withdrawn") {
    return {
      templateKey,
      variables: {
        candidateName: name,
        flowName,
        reason: "请补充作品集后重新报名。",
        operatorName,
        operatorRole,
      },
      department,
    };
  }

  const startsAt = new Date("2026-06-06T16:00:00+08:00");
  return {
    templateKey: templateKey as InterviewScheduleEmailTemplateKey,
    variables: {
      candidateName: name,
      flowName,
      organizerName: "李四",
      startsAt,
      endsAt: new Date(startsAt.getTime() + 30 * 60 * 1000),
      location: "仙林校区大学生活动中心 101",
      note: "请提前准备作品介绍。",
    },
    department,
  };
}