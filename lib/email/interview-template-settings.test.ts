jest.mock("server-only", () => ({}));

const mockSelect = jest.fn();
const mockSelectDistinct = jest.fn();
const mockInsertValues = jest.fn();
const mockInsertReturning = jest.fn();
const mockUpdateSet = jest.fn();
const mockUpdateWhere = jest.fn();
const mockDeleteWhere = jest.fn();
const mockDeleteReturning = jest.fn();

jest.mock("@/db/drizzle", () => ({
  db: {
    select: (...args: unknown[]) => mockSelect(...args),
    selectDistinct: (...args: unknown[]) => mockSelectDistinct(...args),
    insert: () => ({ values: mockInsertValues }),
    update: () => ({ set: mockUpdateSet }),
    delete: () => ({ where: mockDeleteWhere }),
  },
}));

jest.mock("@/lib/authz", () => ({
  getDepartmentScope: jest.fn(async () => ({ kind: "all" })),
  DepartmentAccessError: class DepartmentAccessError extends Error {},
}));

import {
  defaultInterviewScheduleTemplateSettings,
  defaultInterviewWithdrawalTemplateSetting,
  deleteInterviewScheduleTemplateSetting,
  getInterviewScheduleTemplateSetting,
  getInterviewWithdrawalTemplateSetting,
  listInterviewScheduleTemplateSettings,
  upsertInterviewScheduleTemplateSetting,
  type InterviewNotificationTemplateKey,
} from "@/lib/email/interview-template-settings";
import { renderInterviewScheduleEmailSubject } from "@/lib/email/interview-schedule";
import { renderInterviewWithdrawalEmailSubject } from "@/lib/email-center/interview-withdrawal";
import type { DepartmentScope } from "@/lib/authz";
import { emailTemplateContent } from "@/db/schema";
import { drizzle } from "drizzle-orm/node-postgres";
import type { SQL } from "drizzle-orm";

/** 用真实查询构建器把捕获到的过滤条件渲染成 SQL，断言读路径的部门范围 */
const queryDb = drizzle({ client: {} as never });
const renderCondition = (condition: SQL | undefined) =>
  queryDb
    .select()
    .from(emailTemplateContent)
    .where(condition)
    .toSQL();

type ContentRow = {
  templateKey: string;
  department: string | null;
  subjectTemplate: string;
  titleTemplate: string;
  bodyTemplate: string;
  footerText: string;
};

const contentRow = (
  templateKey: string,
  department: string | null,
  bodyTemplate: string,
): ContentRow => ({
  templateKey,
  department,
  subjectTemplate: `{flowName}-${bodyTemplate}`,
  titleTemplate: `${bodyTemplate}-标题`,
  bodyTemplate,
  footerText: "落款",
});

/** select / selectDistinct 的链式结果：可 await，也可继续 .limit() */
const rowsQuery = (rows: unknown[]) =>
  Object.assign(Promise.resolve(rows), { limit: async () => rows });

let selectedRows: unknown[] = [];
let distinctRows: unknown[] = [];
let whereCondition: SQL | undefined;

beforeEach(() => {
  selectedRows = [];
  distinctRows = [];
  whereCondition = undefined;
  mockSelect.mockReset().mockImplementation(() => ({
    from: () => ({
      where: (condition: SQL | undefined) => {
        whereCondition = condition;
        return rowsQuery(selectedRows);
      },
    }),
  }));
  mockSelectDistinct.mockReset().mockImplementation(() => ({
    from: () => rowsQuery(distinctRows),
  }));
  mockInsertValues.mockReset().mockImplementation(() => ({
    returning: mockInsertReturning,
  }));
  mockInsertReturning.mockReset().mockResolvedValue([{ id: 99 }]);
  mockUpdateSet.mockReset().mockImplementation(() => ({ where: mockUpdateWhere }));
  mockUpdateWhere.mockReset().mockResolvedValue(undefined);
  mockDeleteWhere.mockReset().mockImplementation(() => ({
    returning: mockDeleteReturning,
  }));
  mockDeleteReturning.mockReset().mockResolvedValue([{ id: 5 }]);
});

describe("getInterviewScheduleTemplateSetting", () => {
  it("prefers the department override", async () => {
    selectedRows = [
      contentRow("interview.schedule.created", null, "全局-预约"),
      contentRow("interview.schedule.created", "software", "软件-预约"),
    ];

    const setting = await getInterviewScheduleTemplateSetting("created", "software");

    expect(setting.bodyTemplate).toBe("软件-预约");
    expect(setting.department).toBe("software");
    expect(setting.templateKey).toBe("interview.schedule.created");
  });

  it("falls back to the global default row when the department has no override", async () => {
    selectedRows = [contentRow("interview.schedule.created", null, "全局-预约")];

    const setting = await getInterviewScheduleTemplateSetting("created", "software");

    expect(setting.bodyTemplate).toBe("全局-预约");
    expect(setting.department).toBeNull();
  });

  it("falls back to the built-in default when nothing is saved", async () => {
    selectedRows = [];

    const setting = await getInterviewScheduleTemplateSetting("cancelled");

    expect(setting.bodyTemplate).toBe(
      defaultInterviewScheduleTemplateSettings["interview.schedule.cancelled"].bodyTemplate,
    );
    expect(setting.department).toBeNull();
    expect(setting.templateKey).toBe("interview.schedule.cancelled");
  });

  it("keeps the legacy interview.schedule row as the created template fallback", async () => {
    selectedRows = [contentRow("interview.schedule", null, "legacy-预约")];

    const setting = await getInterviewScheduleTemplateSetting("created");

    expect(setting.bodyTemplate).toBe("legacy-预约");
    expect(setting.templateKey).toBe("interview.schedule.created");
  });

  it("prefers the new template key over the legacy key", async () => {
    selectedRows = [
      contentRow("interview.schedule", null, "legacy-预约"),
      contentRow("interview.schedule.created", null, "全局-预约"),
    ];

    const setting = await getInterviewScheduleTemplateSetting("created");

    expect(setting.bodyTemplate).toBe("全局-预约");
  });

  it("prefers the department override on the new key over a legacy department row", async () => {
    selectedRows = [
      contentRow("interview.schedule", "software", "legacy-软件-预约"),
      contentRow("interview.schedule.created", "software", "软件-预约"),
    ];

    const setting = await getInterviewScheduleTemplateSetting("created", "software");

    expect(setting.bodyTemplate).toBe("软件-预约");
  });

  it("resolves the withdrawal template per department", async () => {
    selectedRows = [
      contentRow("interview.application.withdrawn", null, "全局-退回"),
      contentRow("interview.application.withdrawn", "software", "软件-退回"),
    ];

    await expect(getInterviewWithdrawalTemplateSetting("software")).resolves.toEqual(
      expect.objectContaining({ bodyTemplate: "软件-退回", department: "software" }),
    );
    await expect(getInterviewWithdrawalTemplateSetting("media")).resolves.toEqual(
      expect.objectContaining({
        bodyTemplate: "全局-退回",
        department: null,
      }),
    );
    expect(defaultInterviewWithdrawalTemplateSetting.templateKey).toBe(
      "interview.application.withdrawn",
    );
  });
});

describe("listInterviewScheduleTemplateSettings", () => {
  const scope: DepartmentScope = { kind: "all" };

  it("returns one resolved row per template key with override metadata", async () => {
    selectedRows = [
      contentRow("interview.schedule.created", null, "全局-预约"),
      contentRow("interview.schedule.created", "software", "软件-预约"),
      contentRow("interview.application.withdrawn", null, "全局-退回"),
    ];
    distinctRows = [{ department: "software" }, { department: null }, { department: "media" }];

    const payload = await listInterviewScheduleTemplateSettings("software", scope);

    expect(payload.departments).toEqual(["media", "software"]);
    expect(payload.scope).toEqual(scope);
    expect(payload.rows).toHaveLength(4);

    const created = payload.rows.find(
      (row) => row.templateKey === "interview.schedule.created",
    );
    expect(created).toEqual(
      expect.objectContaining({
        bodyTemplate: "软件-预约",
        department: "software",
        hasOverride: true,
        editable: true,
      }),
    );

    const rescheduled = payload.rows.find(
      (row) => row.templateKey === "interview.schedule.rescheduled",
    );
    expect(rescheduled).toEqual(
      expect.objectContaining({
        bodyTemplate:
          defaultInterviewScheduleTemplateSettings["interview.schedule.rescheduled"]
            .bodyTemplate,
        department: null,
        hasOverride: false,
      }),
    );

    const withdrawal = payload.rows.find(
      (row) => row.templateKey === "interview.application.withdrawn",
    );
    // withdrawal 只有全局行：按 software 解析时回落全局，hasOverride 为 false
    expect(withdrawal).toEqual(
      expect.objectContaining({
        bodyTemplate: "全局-退回",
        department: null,
        hasOverride: false,
      }),
    );
  });

  it("marks a global override as present when listing the global default", async () => {
    selectedRows = [contentRow("interview.application.withdrawn", null, "全局-退回")];

    const payload = await listInterviewScheduleTemplateSettings(null, scope);
    const withdrawal = payload.rows.find(
      (row) => row.templateKey === "interview.application.withdrawn",
    );

    expect(withdrawal).toEqual(
      expect.objectContaining({ department: null, hasOverride: true }),
    );
  });

  it("marks the global row as not editable for a department account", async () => {
    selectedRows = [contentRow("interview.application.withdrawn", null, "全局-退回")];

    const payload = await listInterviewScheduleTemplateSettings(null, {
      kind: "department",
      department: "software",
    });

    expect(payload.departments).toEqual(["software"]);
    expect(payload.rows.every((row) => row.editable === false)).toBe(true);
  });

  it("lists no department option for an account without department scope", async () => {
    const payload = await listInterviewScheduleTemplateSettings(undefined, {
      kind: "none",
    });

    expect(payload.departments).toEqual([]);
    expect(payload.scope).toEqual({ kind: "none" });
  });

  it("reads global rows plus its own department overrides for a department account", async () => {
    await listInterviewScheduleTemplateSettings(null, {
      kind: "department",
      department: "software",
    });

    const sql = renderCondition(whereCondition);
    expect(sql.sql).toContain('"email_template_content"."department" is null');
    expect(sql.params).toContain("software");
  });

  it("reads only global rows for an account without department scope", async () => {
    await listInterviewScheduleTemplateSettings(null, { kind: "none" });

    const sql = renderCondition(whereCondition);
    expect(sql.sql).toContain('"email_template_content"."department" is null');
    expect(sql.params).not.toContain("software");
  });

  it("does not filter rows for an admin", async () => {
    await listInterviewScheduleTemplateSettings(null, scope);

    expect(renderCondition(whereCondition).sql).not.toContain(
      '"email_template_content"."department"',
    );
  });
});

describe("rendered subject", () => {
  it("uses the department override, then the global row, then the built-in copy", async () => {
    selectedRows = [
      contentRow("interview.schedule.created", null, "全局-预约"),
      contentRow("interview.schedule.created", "software", "软件-预约"),
    ];

    await expect(
      renderInterviewScheduleEmailSubject("2026 免试招新", "created", "software"),
    ).resolves.toBe("2026 免试招新-软件-预约");
    await expect(
      renderInterviewScheduleEmailSubject("2026 免试招新", "created", "media"),
    ).resolves.toBe("2026 免试招新-全局-预约");

    selectedRows = [];
    await expect(
      renderInterviewScheduleEmailSubject("2026 免试招新", "created"),
    ).resolves.toBe("2026 免试招新 面试预约通知");
  });

  it("uses the department override for the withdrawal subject", async () => {
    selectedRows = [
      contentRow("interview.application.withdrawn", "software", "软件-退回"),
    ];

    await expect(
      renderInterviewWithdrawalEmailSubject("2026 免试招新", "software"),
    ).resolves.toBe("2026 免试招新-软件-退回");
  });
});

describe("template writes", () => {
  const templateKey: InterviewNotificationTemplateKey = "interview.schedule.created";
  const values = {
    subjectTemplate: "主题",
    titleTemplate: "标题",
    bodyTemplate: "{candidateName} 正文 {flowName}",
    footerText: "落款",
  };

  it("creates a department override row", async () => {
    selectedRows = [];

    await expect(
      upsertInterviewScheduleTemplateSetting(templateKey, values, "software"),
    ).resolves.toEqual({ id: 99, mode: "create", department: "software" });
    expect(mockInsertValues).toHaveBeenCalledWith({
      templateKey,
      department: "software",
      ...values,
    });
  });

  it("updates the existing row of the same key and department", async () => {
    selectedRows = [{ id: 7 }];

    await expect(
      upsertInterviewScheduleTemplateSetting(templateKey, values, null),
    ).resolves.toEqual({ id: 7, mode: "update", department: null });
    expect(mockUpdateSet).toHaveBeenCalledWith({ ...values, department: null });
    expect(mockInsertValues).not.toHaveBeenCalled();
  });

  it("deletes the department override row", async () => {
    await expect(
      deleteInterviewScheduleTemplateSetting(templateKey, "software"),
    ).resolves.toBe(true);
    expect(mockDeleteWhere).toHaveBeenCalled();
  });

  it("deletes the global default row when no department is given", async () => {
    await expect(
      deleteInterviewScheduleTemplateSetting(templateKey, null),
    ).resolves.toBe(true);
    expect(mockDeleteWhere).toHaveBeenCalled();
  });

  it("reports that nothing was deleted when the row is missing", async () => {
    mockDeleteReturning.mockResolvedValue([]);

    await expect(
      deleteInterviewScheduleTemplateSetting(templateKey, null),
    ).resolves.toBe(false);
  });
});
