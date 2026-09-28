/** @jest-environment node */

jest.mock("server-only", () => ({}));

export {};

import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import type * as AuthzModule from "@/lib/authz";
import type * as TemplateActions from "@/action/email/template";
import { defaultResultEmailTemplateSettings } from "@/lib/email/template-settings";

const sqlDialect = new PgDialect();

const mockVerifyRole = jest.fn();
const mockGetDepartmentScope = jest.fn();
const mockWriteOperationAudit = jest.fn();
const mockRenderEmailTemplate = jest.fn();
const mockRevalidatePath = jest.fn();

jest.mock("next/cache", () => ({ revalidatePath: mockRevalidatePath }));
jest.mock("@/lib/dal", () => ({
  verifyRole: mockVerifyRole,
  verifySession: jest.fn(),
}));
jest.mock("@/lib/authz", () => ({
  ...jest.requireActual("@/lib/authz"),
  getDepartmentScope: mockGetDepartmentScope,
}));
jest.mock("@/lib/operation-audit", () => ({
  writeOperationAudit: mockWriteOperationAudit,
}));
jest.mock("@/lib/email-center/render", () => ({
  renderEmailTemplate: mockRenderEmailTemplate,
}));

const mockSelectResults: unknown[][] = [];
const mockSelectDistinctResults: unknown[][] = [];
const mockSelectWhereCalls: unknown[] = [];
const mockDeleteWhereCalls: unknown[] = [];
const mockInsertValueCalls: unknown[] = [];
const mockUpdateSetCalls: unknown[] = [];
const mockDeleteResults: unknown[][] = [];

const createQueryResult = <T,>(result: T) => {
  const promise = Promise.resolve(result) as Promise<T> & {
    limit: jest.Mock;
    where: jest.Mock;
  };
  promise.limit = jest.fn(() => Promise.resolve(result));
  promise.where = jest.fn((condition: unknown) => {
    mockSelectWhereCalls.push(condition);
    return createQueryResult(result);
  });
  return promise;
};

const mockDb = {
  select: jest.fn(() => {
    const result = mockSelectResults.shift() ?? [];
    return { from: jest.fn(() => createQueryResult(result)) };
  }),
  selectDistinct: jest.fn(() => {
    const result = mockSelectDistinctResults.shift() ?? [];
    return { from: jest.fn(() => Promise.resolve(result)) };
  }),
  insert: jest.fn(() => ({
    values: jest.fn((values: unknown) => {
      mockInsertValueCalls.push(values);
      return { returning: jest.fn(() => Promise.resolve([{ id: 42 }])) };
    }),
  })),
  update: jest.fn(() => ({
    set: jest.fn((values: unknown) => {
      mockUpdateSetCalls.push(values);
      return { where: jest.fn(() => Promise.resolve([])) };
    }),
  })),
  delete: jest.fn(() => ({
    where: jest.fn((condition: unknown) => {
      mockDeleteWhereCalls.push(condition);
      return {
        returning: jest.fn(() => Promise.resolve(mockDeleteResults.shift() ?? [])),
      };
    }),
  })),
};

jest.mock("@/db/drizzle", () => ({ db: mockDb }));

const globalRow = {
  id: 1,
  templateKey: "recruitment.result.accepted",
  department: null,
  subjectTemplate: "全局主题",
  titleTemplate: "全局标题",
  subtitleTemplate: "全局副标题",
  resultBadgeTemplate: "通过通知",
  resultTitleTemplate: "恭喜",
  resultSummaryTemplate: "全局摘要",
  bodyTemplate: "全局正文",
  memberInfoFormUrl: "https://example.com/global-form",
  feishuGroupUrl: "https://example.com/global-group",
  calendarUrl: "https://example.com/global-calendar",
  feishuRegisterHelpUrl: "https://example.com/global-help",
  contactEmail: "global@example.com",
  memberFormLabel: "成员信息表",
  feishuGroupName: "SAST 群",
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};

const softwareRow = {
  ...globalRow,
  id: 2,
  department: "software",
  subjectTemplate: "软件主题",
  titleTemplate: "",
  contactEmail: "software@example.com",
};

const templateValues = {
  subjectTemplate: "{flowName} 结果通知",
  titleTemplate: "标题",
  subtitleTemplate: "副标题",
  resultBadgeTemplate: "通过通知",
  resultTitleTemplate: "恭喜",
  resultSummaryTemplate: "摘要",
  bodyTemplate: "正文",
  memberInfoFormUrl: "https://example.com/form",
  feishuGroupUrl: "https://example.com/group",
  calendarUrl: "https://example.com/calendar",
  feishuRegisterHelpUrl: "https://example.com/help",
  contactEmail: "template@example.com",
  memberFormLabel: "成员信息表",
  feishuGroupName: "SAST 群",
};

const recruitmentDefault = defaultResultEmailTemplateSettings.find(
  (item) => item.templateKey === "recruitment.result.accepted",
)!;

let getEmailTemplateSetting: typeof TemplateActions.getEmailTemplateSetting;
let listEmailTemplateSettings: typeof TemplateActions.listEmailTemplateSettings;
let updateEmailTemplateSetting: typeof TemplateActions.updateEmailTemplateSetting;
let resetEmailTemplateSetting: typeof TemplateActions.resetEmailTemplateSetting;
let DepartmentAccessError: typeof AuthzModule.DepartmentAccessError;

describe("result email template settings", () => {
  beforeAll(async () => {
    /* jest.mock 工厂引用本文件内的 mock 常量，静态 import 会在常量初始化前触发 require，故动态加载 */
    ({ DepartmentAccessError } = await import("@/lib/authz"));
    ({
      getEmailTemplateSetting,
      listEmailTemplateSettings,
      updateEmailTemplateSetting,
      resetEmailTemplateSetting,
    } = await import("@/action/email/template"));
  });

  beforeEach(() => {
    mockSelectResults.length = 0;
    mockSelectDistinctResults.length = 0;
    mockSelectWhereCalls.length = 0;
    mockDeleteWhereCalls.length = 0;
    mockInsertValueCalls.length = 0;
    mockUpdateSetCalls.length = 0;
    mockDeleteResults.length = 0;
    jest.clearAllMocks();
    mockVerifyRole.mockResolvedValue({ uid: 7, role: 3, name: "测试账号" });
    mockGetDepartmentScope.mockResolvedValue({ kind: "all" });
    mockRenderEmailTemplate.mockResolvedValue({ subject: "主题", html: "<p>正文</p>" });
  });

  describe("getEmailTemplateSetting", () => {
    it("prefers the department override over the global default", async () => {
      mockSelectResults.push([globalRow, softwareRow]);

      const setting = await getEmailTemplateSetting(
        "recruitment.result.accepted",
        "software",
      );

      expect(setting.subjectTemplate).toBe("软件主题");
      expect(setting.department).toBe("software");
      /* 覆盖行为空字段时继续回落到内置默认文案 */
      expect(setting.titleTemplate).toBe(recruitmentDefault.titleTemplate);
      expect(setting.contactEmail).toBe("software@example.com");
    });

    it("falls back to the global default when the department has no override", async () => {
      mockSelectResults.push([globalRow]);

      const setting = await getEmailTemplateSetting(
        "recruitment.result.accepted",
        "media",
      );

      expect(setting.subjectTemplate).toBe("全局主题");
      expect(setting.department).toBeNull();
    });

    it("falls back to the built-in defaults when no row exists", async () => {
      mockSelectResults.push([]);

      const setting = await getEmailTemplateSetting(
        "recruitment.result.accepted",
        "software",
      );

      expect(setting.subjectTemplate).toBe(recruitmentDefault.subjectTemplate);
      expect(setting.department).toBeNull();
    });
  });

  describe("listEmailTemplateSettings", () => {
    it("filters rows by the department scope and reports editability", async () => {
      mockGetDepartmentScope.mockResolvedValue({
        kind: "department",
        department: "software",
      });
      mockSelectResults.push([globalRow, softwareRow]);
      mockSelectDistinctResults.push([]);

      const payload = await listEmailTemplateSettings("software");

      const readFilter = sqlDialect.sqlToQuery(mockSelectWhereCalls[0] as SQL);
      expect(readFilter.sql).toContain("department");
      expect(readFilter.params).toContain("software");

      expect(payload.scope).toEqual({ kind: "department", department: "software" });
      expect(payload.departments).toEqual(["software"]);

      const accepted = payload.rows.find(
        (row) => row.templateKey === "recruitment.result.accepted",
      );
      expect(accepted).toEqual(
        expect.objectContaining({
          department: "software",
          editable: true,
          hasOverride: true,
          subjectTemplate: "软件主题",
        }),
      );

      const untouched = payload.rows.find(
        (row) => row.templateKey === "soc.result.accepted",
      );
      expect(untouched).toEqual(
        expect.objectContaining({
          department: null,
          editable: false,
          hasOverride: false,
        }),
      );
    });

    it("lists the departments seen in stored rows for admins", async () => {
      mockSelectResults.push([globalRow, softwareRow]);
      mockSelectDistinctResults.push([
        { department: "software" },
        { department: null },
        { department: "media" },
      ]);

      const payload = await listEmailTemplateSettings();

      expect(payload.departments).toEqual(["media", "software"]);
      expect(payload.scope).toEqual({ kind: "all" });
      expect(mockSelectWhereCalls).toEqual([]);
    });
  });

  describe("updateEmailTemplateSetting", () => {
    it("rejects a department account writing another department", async () => {
      mockGetDepartmentScope.mockResolvedValue({
        kind: "department",
        department: "software",
      });

      await expect(
        updateEmailTemplateSetting(
          "recruitment.result.accepted",
          templateValues,
          "media",
        ),
      ).rejects.toThrow(DepartmentAccessError);

      expect(mockDb.insert).not.toHaveBeenCalled();
      expect(mockDb.update).not.toHaveBeenCalled();
      expect(mockWriteOperationAudit).not.toHaveBeenCalled();
    });

    it("pins a department account writing the global default to its own department", async () => {
      mockGetDepartmentScope.mockResolvedValue({
        kind: "department",
        department: "software",
      });
      mockSelectResults.push([]);

      await expect(
        updateEmailTemplateSetting(
          "recruitment.result.accepted",
          templateValues,
          null,
        ),
      ).resolves.toEqual({ ok: true });

      const targetSql = sqlDialect.sqlToQuery(mockSelectWhereCalls[0] as SQL);
      expect(targetSql.params).toContain("software");
      expect(mockInsertValueCalls).toEqual([
        expect.objectContaining({
          templateKey: "recruitment.result.accepted",
          department: "software",
          subjectTemplate: "{flowName} 结果通知",
        }),
      ]);
      expect(mockWriteOperationAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "email.template.update",
          department: "software",
          metadata: expect.objectContaining({ department: "software" }),
        }),
      );
    });

    it("writes the global default row for admins", async () => {
      mockSelectResults.push([{ id: 9 }]);

      await expect(
        updateEmailTemplateSetting("recruitment.result.accepted", templateValues),
      ).resolves.toEqual({ ok: true });

      const targetSql = sqlDialect.sqlToQuery(mockSelectWhereCalls[0] as SQL);
      expect(targetSql.sql).toContain("is null");
      expect(mockUpdateSetCalls).toEqual([
        expect.objectContaining({ department: null }),
      ]);
      expect(mockWriteOperationAudit).toHaveBeenCalledWith(
        expect.objectContaining({ department: null }),
      );
    });
  });

  describe("resetEmailTemplateSetting", () => {
    it("deletes the department override row", async () => {
      mockGetDepartmentScope.mockResolvedValue({
        kind: "department",
        department: "software",
      });
      mockSelectResults.push([{ id: 2 }]);
      mockDeleteResults.push([{ id: 2 }]);

      await expect(
        resetEmailTemplateSetting("recruitment.result.accepted", "software"),
      ).resolves.toEqual({ ok: true });

      const deleteSql = sqlDialect.sqlToQuery(mockDeleteWhereCalls[0] as SQL);
      expect(deleteSql.params).toContain("software");
      expect(mockWriteOperationAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "email.template.reset",
          department: "software",
          resourceId: 2,
        }),
      );
    });

    it("deletes the global default row for admins", async () => {
      mockSelectResults.push([{ id: 9 }]);
      mockDeleteResults.push([{ id: 9 }]);

      await expect(
        resetEmailTemplateSetting("recruitment.result.accepted"),
      ).resolves.toEqual({ ok: true });

      const deleteSql = sqlDialect.sqlToQuery(mockDeleteWhereCalls[0] as SQL);
      expect(deleteSql.sql).toContain("is null");
      expect(mockWriteOperationAudit).toHaveBeenCalledWith(
        expect.objectContaining({ department: null, resourceId: 9 }),
      );
    });

    it("throws when the target scope has no override row", async () => {
      mockGetDepartmentScope.mockResolvedValue({
        kind: "department",
        department: "software",
      });
      mockSelectResults.push([]);

      await expect(
        resetEmailTemplateSetting("recruitment.result.accepted", "software"),
      ).rejects.toThrow("模板未覆盖，无需重置。");

      expect(mockDb.delete).not.toHaveBeenCalled();
      expect(mockWriteOperationAudit).not.toHaveBeenCalled();
    });

    it("rejects accounts without a department", async () => {
      mockGetDepartmentScope.mockResolvedValue({ kind: "none" });

      await expect(
        resetEmailTemplateSetting("recruitment.result.accepted"),
      ).rejects.toThrow("当前账号未归属任何部门");

      expect(mockDb.select).not.toHaveBeenCalled();
      expect(mockDb.delete).not.toHaveBeenCalled();
    });
  });
});
