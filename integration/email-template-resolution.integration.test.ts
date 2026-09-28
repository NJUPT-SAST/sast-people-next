import { db } from "@/db/drizzle";
import { emailTemplateSetting } from "@/db/schema";
import { getEmailTemplateSetting } from "@/action/email/template";
import { and, eq, isNull } from "drizzle-orm";

const TEMPLATE_KEY = "recruitment.result.accepted";
const SUBJECT_GLOBAL = "集成测试-全局默认";
const SUBJECT_SOFTWARE = "集成测试-软件覆盖";

const upsertOverride = async (department: string | null, subjectTemplate: string) => {
  const existing = await db
    .select({ id: emailTemplateSetting.id })
    .from(emailTemplateSetting)
    .where(
      and(
        eq(emailTemplateSetting.templateKey, TEMPLATE_KEY),
        department
          ? eq(emailTemplateSetting.department, department)
          : isNull(emailTemplateSetting.department),
      ),
    )
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(emailTemplateSetting)
      .set({ subjectTemplate })
      .where(eq(emailTemplateSetting.id, existing[0].id));
    return;
  }

  await db.insert(emailTemplateSetting).values({
    templateKey: TEMPLATE_KEY,
    department,
    subjectTemplate,
    memberInfoFormUrl: "https://example.com/form",
    feishuGroupUrl: "https://example.com/group",
    calendarUrl: "https://example.com/calendar",
    feishuRegisterHelpUrl: "https://example.com/help",
    contactEmail: "integration@example.com",
    memberFormLabel: "成员信息表",
    feishuGroupName: "集成测试群",
  });
};

describe("department template resolution", () => {
  afterAll(async () => {
    await db
      .delete(emailTemplateSetting)
      .where(
        and(
          eq(emailTemplateSetting.templateKey, TEMPLATE_KEY),
          isNull(emailTemplateSetting.department),
        ),
      );
    await db
      .delete(emailTemplateSetting)
      .where(
        and(
          eq(emailTemplateSetting.templateKey, TEMPLATE_KEY),
          eq(emailTemplateSetting.department, "software"),
        ),
      );
    await db.$client.end();
  });

  it("prefers the department override and falls back to the global default", async () => {
    await upsertOverride(null, SUBJECT_GLOBAL);
    await upsertOverride("software", SUBJECT_SOFTWARE);

    await expect(getEmailTemplateSetting(TEMPLATE_KEY, "software")).resolves.toMatchObject({
      subjectTemplate: SUBJECT_SOFTWARE,
      department: "software",
    });
    await expect(getEmailTemplateSetting(TEMPLATE_KEY, "media")).resolves.toMatchObject({
      subjectTemplate: SUBJECT_GLOBAL,
      department: null,
    });
    await expect(getEmailTemplateSetting(TEMPLATE_KEY)).resolves.toMatchObject({
      subjectTemplate: SUBJECT_GLOBAL,
      department: null,
    });
  });

  it("falls back to the built-in defaults once every override is removed", async () => {
    await db
      .delete(emailTemplateSetting)
      .where(eq(emailTemplateSetting.templateKey, TEMPLATE_KEY));

    const setting = await getEmailTemplateSetting(TEMPLATE_KEY, "software");

    expect(setting.templateKey).toBe(TEMPLATE_KEY);
    expect(setting.subjectTemplate).not.toBe(SUBJECT_SOFTWARE);
    expect(setting.subjectTemplate).not.toBe(SUBJECT_GLOBAL);
    expect(setting.department ?? null).toBeNull();
  });
});
