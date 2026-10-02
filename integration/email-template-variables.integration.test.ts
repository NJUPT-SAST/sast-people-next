/** @jest-environment node */

/**
 * 模板变量落库 → 渲染的端到端解析：
 * - 落库的 {groupNumber} 必须进入邮件正文（真实发送路径取 setting.groupNumber）；
 * - 部门覆盖行存在时整行生效（不回落全局默认行）——这是当前口径，用例固定住它。
 *
 * 说明：这里用 `renderTemplateText` 复现 `emails/offer.tsx` 的替换
 * （@react-email/render 在 CJS 下需要 --experimental-vm-modules，不适合放在集成环境）。
 */

import { db } from "@/db/drizzle";
import { emailTemplateSetting } from "@/db/schema";
import {
  defaultResultEmailTemplateSettings,
  renderTemplateText,
} from "@/lib/email/template-settings";
import { readResultEmailTemplateSetting } from "@/lib/email-center/template-resolution";
import { and, eq, isNull } from "drizzle-orm";

const TEMPLATE_KEY = "office_round1.result.accepted";

const baseValues = () => {
  const base = defaultResultEmailTemplateSettings.find(
    (item) => item.templateKey === TEMPLATE_KEY,
  )!;
  return {
    templateKey: TEMPLATE_KEY,
    subjectTemplate: base.subjectTemplate,
    titleTemplate: base.titleTemplate,
    subtitleTemplate: base.subtitleTemplate,
    resultBadgeTemplate: base.resultBadgeTemplate,
    resultTitleTemplate: base.resultTitleTemplate,
    resultSummaryTemplate: base.resultSummaryTemplate,
    bodyTemplate: base.bodyTemplate,
    memberInfoFormUrl: base.memberInfoFormUrl,
    feishuGroupUrl: base.feishuGroupUrl,
    calendarUrl: base.calendarUrl,
    feishuRegisterHelpUrl: base.feishuRegisterHelpUrl,
    contactEmail: base.contactEmail,
    memberFormLabel: base.memberFormLabel,
    feishuGroupName: base.feishuGroupName,
  };
};

const clearRows = () =>
  db
    .delete(emailTemplateSetting)
    .where(eq(emailTemplateSetting.templateKey, TEMPLATE_KEY));

describe("模板变量落库到渲染", () => {
  afterAll(async () => {
    await clearRows();
    await db.$client.end();
  });

  it("正文里的 {groupNumber} 用落库的 QQ 群号渲染", async () => {
    await clearRows();
    await db
      .insert(emailTemplateSetting)
      .values({ ...baseValues(), department: null, groupNumber: "999888777" });

    const setting = await readResultEmailTemplateSetting(TEMPLATE_KEY, "office");

    expect(setting.groupNumber).toBe("999888777");
    /* 真实发送（lib/email-center/batch.ts）就是把这个值交给渲染层 */
    const body = renderTemplateText(setting.bodyTemplate, {
      groupNumber: setting.groupNumber,
      department: "办公室",
    });
    expect(body).toContain("999888777");
    expect(body).not.toContain("{groupNumber}");
  });

  it("部门覆盖行整行生效：不会回落全局默认行的群号", async () => {
    await clearRows();
    await db
      .insert(emailTemplateSetting)
      .values({ ...baseValues(), department: null, groupNumber: "999888777" });
    await db
      .insert(emailTemplateSetting)
      .values({ ...baseValues(), department: "office", groupNumber: "" });

    const resolved = await readResultEmailTemplateSetting(TEMPLATE_KEY, "office");

    /* 当前口径：命中部门覆盖行就用它，即使该行的群号为空 */
    expect(resolved.groupNumber).toBe("");
    expect(
      renderTemplateText(resolved.bodyTemplate, {
        groupNumber: resolved.groupNumber,
      }),
    ).not.toContain("999888777");

    /* 未覆盖的部门仍然拿到全局默认 */
    const other = await readResultEmailTemplateSetting(TEMPLATE_KEY, "liaison");
    expect(other.groupNumber).toBe("999888777");
  });

  it("没有任何落库行时回落到内置默认", async () => {
    await clearRows();

    const setting = await readResultEmailTemplateSetting(TEMPLATE_KEY, "office");
    const fallback = defaultResultEmailTemplateSettings.find(
      (item) => item.templateKey === TEMPLATE_KEY,
    )!;

    expect(setting.groupNumber).toBe(fallback.groupNumber);
    expect(setting.bodyTemplate).toBe(fallback.bodyTemplate);
    await db
      .delete(emailTemplateSetting)
      .where(
        and(
          eq(emailTemplateSetting.templateKey, TEMPLATE_KEY),
          isNull(emailTemplateSetting.department),
        ),
      );
  });
});