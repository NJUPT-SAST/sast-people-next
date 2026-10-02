import { db } from "@/db/drizzle";
import { emailTemplateContent, emailTemplateSetting } from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import crypto from "node:crypto";

const createdTemplateSettingKeys: string[] = [];
const createdTemplateContentKeys: string[] = [];

const uniqueKey = () => `integration.template.${crypto.randomUUID()}`;

const insertSetting = (templateKey: string, department: string | null) => {
  createdTemplateSettingKeys.push(templateKey);
  return db.insert(emailTemplateSetting).values({
    templateKey,
    department,
    subjectTemplate: "集成测试主题",
    memberInfoFormUrl: "https://example.com/form",
    feishuGroupUrl: "https://example.com/group",
    calendarUrl: "https://example.com/calendar",
    feishuRegisterHelpUrl: "https://example.com/help",
    contactEmail: "integration@example.com",
    memberFormLabel: "成员信息表",
    feishuGroupName: "集成测试群",
  });
};

const insertContent = (templateKey: string, department: string | null) => {
  createdTemplateContentKeys.push(templateKey);
  return db.insert(emailTemplateContent).values({
    templateKey,
    department,
    subjectTemplate: "集成测试主题",
    titleTemplate: "集成测试标题",
    bodyTemplate: "集成测试正文",
    footerText: "集成测试落款",
  });
};

describe("email template department overrides", () => {
  afterAll(async () => {
    if (createdTemplateSettingKeys.length > 0) {
      await db
        .delete(emailTemplateSetting)
        .where(inArray(emailTemplateSetting.templateKey, createdTemplateSettingKeys));
    }
    if (createdTemplateContentKeys.length > 0) {
      await db
        .delete(emailTemplateContent)
        .where(inArray(emailTemplateContent.templateKey, createdTemplateContentKeys));
    }
    await db.$client.end();
  });

  it("keeps one global default and one row per department for the same template key", async () => {
    const templateKey = uniqueKey();

    await insertSetting(templateKey, null);
    await insertSetting(templateKey, "software");
    await insertSetting(templateKey, "media");

    const rows = await db
      .select({ department: emailTemplateSetting.department })
      .from(emailTemplateSetting)
      .where(eq(emailTemplateSetting.templateKey, templateKey));

    expect(rows.map((row) => row.department).sort()).toEqual([
      null,
      "media",
      "software",
    ].sort());
  });

  it("rejects a duplicate row for the same key and department", async () => {
    const templateKey = uniqueKey();
    await insertSetting(templateKey, "software");

    await expect(insertSetting(templateKey, "software")).rejects.toMatchObject({
      cause: {
        code: "23505",
        constraint: "email_template_setting_key_department_uidx",
      },
    });
  });

  it("rejects a duplicate global default as well", async () => {
    const templateKey = uniqueKey();
    await insertSetting(templateKey, null);

    await expect(insertSetting(templateKey, null)).rejects.toMatchObject({
      cause: {
        code: "23505",
        constraint: "email_template_setting_key_department_uidx",
      },
    });
  });

  it("applies the same rule to interview template content", async () => {
    const templateKey = uniqueKey();
    await insertContent(templateKey, null);
    await insertContent(templateKey, "software");

    await expect(insertContent(templateKey, "software")).rejects.toMatchObject({
      cause: {
        code: "23505",
        constraint: "email_template_content_key_department_uidx",
      },
    });

    const scoped = await db
      .select({ id: emailTemplateContent.id })
      .from(emailTemplateContent)
      .where(
        and(
          eq(emailTemplateContent.templateKey, templateKey),
          eq(emailTemplateContent.department, "software"),
        ),
      );

    expect(scoped).toHaveLength(1);
  });
});
