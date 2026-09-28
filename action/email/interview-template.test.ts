/** @jest-environment node */

jest.mock("server-only", () => ({}));

const mockVerifyRole: jest.Mock = jest.fn();
const mockGetDepartmentScope: jest.Mock = jest.fn();
const mockWriteOperationAudit: jest.Mock = jest.fn(async () => undefined);
const mockRevalidatePath: jest.Mock = jest.fn();
const mockLogServerError: jest.Mock = jest.fn();

const mockSelect: jest.Mock = jest.fn();
const mockInsertValues: jest.Mock = jest.fn();
const mockInsertReturning: jest.Mock = jest.fn();
const mockDeleteWhere: jest.Mock = jest.fn();
const mockDeleteReturning: jest.Mock = jest.fn();

jest.mock("@/lib/dal", () => ({
  verifyRole: (...args: unknown[]) => mockVerifyRole(...args),
}));

jest.mock("@/lib/authz", () => ({
  getDepartmentScope: (...args: unknown[]) => mockGetDepartmentScope(...args),
  DepartmentAccessError: class DepartmentAccessError extends Error {
    constructor(message: string) {
      super(message);
      this.name = "DepartmentAccessError";
    }
  },
}));

jest.mock("@/lib/operation-audit", () => ({
  writeOperationAudit: (...args: unknown[]) => mockWriteOperationAudit(...args),
}));

jest.mock("@/lib/server-error-log", () => ({
  logServerError: (...args: unknown[]) => mockLogServerError(...args),
}));

jest.mock("next/cache", () => ({
  revalidatePath: (path: string) => mockRevalidatePath(path),
}));

jest.mock("@/lib/email/interview-schedule", () => ({
  renderInterviewScheduleEmailPreview: jest.fn(async () => "<html>preview</html>"),
}));

jest.mock("@/lib/email-center/interview-withdrawal", () => ({
  renderInterviewWithdrawalEmailPreview: jest.fn(async () => "<html>preview</html>"),
}));

jest.mock("@/db/drizzle", () => ({
  db: {
    select: (...args: unknown[]) => mockSelect(...args),
    selectDistinct: () => ({ from: () => rowsQuery([]) }),
    insert: () => ({ values: mockInsertValues }),
    update: () => ({ set: () => ({ where: jest.fn() }) }),
    delete: () => ({ where: mockDeleteWhere }),
  },
}));

import {
  getInterviewScheduleEmailTemplate,
  resetInterviewScheduleEmailTemplate,
  updateInterviewScheduleEmailTemplate,
} from "@/action/email/interview-template";
import { DepartmentAccessError } from "@/lib/authz";
import {
  defaultInterviewScheduleTemplateSettings,
  type InterviewNotificationTemplateKey,
} from "@/lib/email/interview-template-settings";
import { emailTemplateContent } from "@/db/schema";
import { drizzle } from "drizzle-orm/node-postgres";
import type { SQL } from "drizzle-orm";

const queryDb = drizzle({ client: {} as never });

const rowsQuery = (rows: unknown[]) =>
  Object.assign(Promise.resolve(rows), { limit: async () => rows });

type ContentRow = {
  templateKey: string;
  department: string | null;
  subjectTemplate: string;
  titleTemplate: string;
  bodyTemplate: string;
  footerText: string;
};

const contentRow = (
  templateKey: InterviewNotificationTemplateKey,
  department: string | null,
  bodyTemplate: string,
): ContentRow => ({
  templateKey,
  department,
  subjectTemplate: `${bodyTemplate}-主题`,
  titleTemplate: `${bodyTemplate}-标题`,
  bodyTemplate,
  footerText: "落款",
});

const templateKey: InterviewNotificationTemplateKey = "interview.schedule.created";

const validValues = {
  subjectTemplate: "{flowName} 主题",
  titleTemplate: "标题",
  bodyTemplate: "{candidateName} 同学，{flowName} 的面试安排如下。",
  footerText: "南京邮电大学大学生科学技术协会",
};

let selectedRows: unknown[] = [];
let deleteCondition: SQL | undefined;

const renderDeleteCondition = () =>
  queryDb
    .select()
    .from(emailTemplateContent)
    .where(deleteCondition)
    .toSQL();

beforeEach(() => {
  selectedRows = [];
  deleteCondition = undefined;
  mockVerifyRole.mockReset().mockResolvedValue({
    isAuth: true,
    uid: 11,
    name: "管理员",
    role: 3,
    department: null,
  });
  mockGetDepartmentScope.mockReset().mockResolvedValue({ kind: "all" });
  mockWriteOperationAudit.mockClear();
  mockRevalidatePath.mockClear();
  mockLogServerError.mockClear();
  mockSelect.mockReset().mockImplementation(() => ({
    from: () => ({ where: () => rowsQuery(selectedRows) }),
  }));
  mockInsertValues.mockReset().mockImplementation(() => ({
    returning: mockInsertReturning,
  }));
  mockInsertReturning.mockReset().mockResolvedValue([{ id: 42 }]);
  mockDeleteWhere.mockReset().mockImplementation((condition: SQL) => {
    deleteCondition = condition;
    return { returning: mockDeleteReturning };
  });
  mockDeleteReturning.mockReset().mockResolvedValue([{ id: 7 }]);
});

describe("resetInterviewScheduleEmailTemplate", () => {
  it("deletes the global row and falls back to the built-in copy", async () => {
    const setting = await resetInterviewScheduleEmailTemplate(templateKey);

    expect(renderDeleteCondition().sql).toContain(
      '"email_template_content"."department" is null',
    );
    expect(renderDeleteCondition().params).toEqual([templateKey]);
    expect(setting.bodyTemplate).toBe(
      defaultInterviewScheduleTemplateSettings["interview.schedule.created"].bodyTemplate,
    );
    expect(mockWriteOperationAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "email.template.reset",
        department: null,
        metadata: expect.objectContaining({ templateKey, department: null }),
      }),
    );
  });

  it("deletes the department row and falls back to the global default", async () => {
    selectedRows = [contentRow(templateKey, null, "全局-预约")];

    const setting = await resetInterviewScheduleEmailTemplate(templateKey, "software");

    const sql = renderDeleteCondition();
    expect(sql.sql).toContain('"email_template_content"."department" = ');
    expect(sql.params).toEqual([templateKey, "software"]);
    expect(setting.bodyTemplate).toBe("全局-预约");
    expect(mockWriteOperationAudit).toHaveBeenCalledWith(
      expect.objectContaining({ department: "software" }),
    );
  });

  it("rejects a reset when the row is not overridden", async () => {
    mockDeleteReturning.mockResolvedValue([]);

    await expect(
      resetInterviewScheduleEmailTemplate(templateKey, "software"),
    ).rejects.toThrow("模板未覆盖，无需重置");
    expect(mockWriteOperationAudit).not.toHaveBeenCalled();
  });

  it("resets its own department for a department account", async () => {
    mockGetDepartmentScope.mockResolvedValue({
      kind: "department",
      department: "software",
    });

    await resetInterviewScheduleEmailTemplate(templateKey);

    expect(renderDeleteCondition().params).toEqual([templateKey, "software"]);
  });

  it("refuses to reset another department", async () => {
    mockGetDepartmentScope.mockResolvedValue({
      kind: "department",
      department: "software",
    });

    await expect(
      resetInterviewScheduleEmailTemplate(templateKey, "media"),
    ).rejects.toThrow(DepartmentAccessError);
    expect(mockDeleteWhere).not.toHaveBeenCalled();
  });

  it("refuses an account without a department", async () => {
    mockGetDepartmentScope.mockResolvedValue({ kind: "none" });

    await expect(resetInterviewScheduleEmailTemplate(templateKey)).rejects.toThrow(
      "当前账号未归属任何部门，无法管理邮件模板。",
    );
    expect(mockDeleteWhere).not.toHaveBeenCalled();
  });
});

describe("updateInterviewScheduleEmailTemplate", () => {
  it("saves a department account's edit as its own department override", async () => {
    mockGetDepartmentScope.mockResolvedValue({
      kind: "department",
      department: "software",
    });

    await expect(
      updateInterviewScheduleEmailTemplate(templateKey, validValues),
    ).resolves.toEqual({ ok: true });
    expect(mockInsertValues).toHaveBeenCalledWith({
      templateKey,
      department: "software",
      ...validValues,
    });
    expect(mockWriteOperationAudit).toHaveBeenCalledWith(
      expect.objectContaining({ department: "software" }),
    );
  });

  it("rejects a body template without the required variables", async () => {
    await expect(
      updateInterviewScheduleEmailTemplate(templateKey, {
        ...validValues,
        bodyTemplate: "缺少变量",
      }),
    ).resolves.toEqual({
      ok: false,
      message: "正文里需要包含 {candidateName} 和 {flowName}，方便系统替换候选人和流程名称。",
    });
    expect(mockInsertValues).not.toHaveBeenCalled();
  });
});

describe("getInterviewScheduleEmailTemplate", () => {
  it("resolves the department override for a department account", async () => {
    mockGetDepartmentScope.mockResolvedValue({
      kind: "department",
      department: "software",
    });
    selectedRows = [contentRow(templateKey, "software", "软件-预约")];

    await expect(getInterviewScheduleEmailTemplate()).resolves.toEqual(
      expect.objectContaining({ bodyTemplate: "软件-预约", department: "software" }),
    );
  });
});
