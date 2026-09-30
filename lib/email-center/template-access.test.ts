/** @jest-environment node */

import {
  canEditTemplateRow,
  canReadTemplateDepartment,
  mergeTemplateDepartmentOptions,
  pickTemplateSettingRow,
  resolveTemplateEditTarget,
  templateReadFilter,
} from "./template-access";
import type { DepartmentScope } from "@/lib/authz";
import { emailTemplateSetting } from "@/db/schema";
import { drizzle } from "drizzle-orm/node-postgres";

const queryDb = drizzle({ client: {} as never });

const renderFilter = (scope: DepartmentScope) =>
  queryDb
    .select()
    .from(emailTemplateSetting)
    .where(templateReadFilter(emailTemplateSetting.department, scope))
    .toSQL();

const all: DepartmentScope = { kind: "all" };
const software: DepartmentScope = { kind: "department", department: "software" };
const office: DepartmentScope = { kind: "department", department: "office" };
const none: DepartmentScope = { kind: "none" };

describe("office interview templates follow the department override rules", () => {
  const officeKey = "office_round1.result.accepted";

  it("writes the office account's own department override row", () => {
    expect(resolveTemplateEditTarget(office, null)).toEqual({
      kind: "department",
      department: "office",
    });
    expect(resolveTemplateEditTarget(office, "office")).toEqual({
      kind: "department",
      department: "office",
    });
  });

  it("rejects cross-department and department-less writes", () => {
    expect(() => resolveTemplateEditTarget(office, "publicity")).toThrow(
      "无权管理其他部门的邮件模板",
    );
    expect(() => resolveTemplateEditTarget(none, null)).toThrow(
      "当前账号未归属任何部门，无法管理邮件模板。",
    );
  });

  it("lets admins write the global default or any office department", () => {
    expect(resolveTemplateEditTarget(all, null)).toEqual({ kind: "global" });
    expect(resolveTemplateEditTarget(all, "office")).toEqual({
      kind: "department",
      department: "office",
    });
    expect(resolveTemplateEditTarget(all, "publicity")).toEqual({
      kind: "department",
      department: "publicity",
    });
  });

  it("keeps the global default admin-only and the own override editable", () => {
    expect(canEditTemplateRow(office, "office")).toBe(true);
    expect(canEditTemplateRow(office, null)).toBe(false);
    expect(canEditTemplateRow(office, "publicity")).toBe(false);
    expect(canEditTemplateRow(all, null)).toBe(true);
    expect(canEditTemplateRow(all, "office")).toBe(true);
    expect(canEditTemplateRow(software, "office")).toBe(false);
  });

  it("resolves the office department override over the global default", () => {
    const rows = [
      { templateKey: officeKey, department: null, subjectTemplate: "全局" },
      { templateKey: officeKey, department: "office", subjectTemplate: "办公室" },
    ];

    expect(pickTemplateSettingRow(rows, "office")?.subjectTemplate).toBe("办公室");
    expect(pickTemplateSettingRow(rows, "publicity")?.subjectTemplate).toBe("全局");
  });
});

describe("resolveTemplateEditTarget", () => {
  it("lets admins write the global default or any department", () => {
    expect(resolveTemplateEditTarget(all, null)).toEqual({ kind: "global" });
    expect(resolveTemplateEditTarget(all, "media")).toEqual({
      kind: "department",
      department: "media",
    });
  });

  it("pins department accounts to their own department", () => {
    expect(resolveTemplateEditTarget(software, null)).toEqual({
      kind: "department",
      department: "software",
    });
    expect(resolveTemplateEditTarget(software, "software")).toEqual({
      kind: "department",
      department: "software",
    });
  });

  it("rejects cross-department and department-less writes", () => {
    expect(() => resolveTemplateEditTarget(software, "media")).toThrow(
      "无权管理其他部门的邮件模板",
    );
    expect(() => resolveTemplateEditTarget(none, "media")).toThrow(
      "当前账号未归属任何部门，无法管理邮件模板。",
    );
  });
});

describe("canEditTemplateRow", () => {
  it("keeps the global default super-admin only", () => {
    expect(canEditTemplateRow(all, null)).toBe(true);
    expect(canEditTemplateRow(software, null)).toBe(false);
    expect(canEditTemplateRow(software, "software")).toBe(true);
    expect(canEditTemplateRow(software, "media")).toBe(false);
    expect(canEditTemplateRow(none, "software")).toBe(false);
  });
});

describe("pickTemplateSettingRow", () => {
  const rows = [
    { templateKey: "recruitment.result.accepted", department: null, subjectTemplate: "全局" },
    { templateKey: "recruitment.result.accepted", department: "software", subjectTemplate: "软件" },
  ];

  it("prefers the department override", () => {
    expect(pickTemplateSettingRow(rows, "software")?.subjectTemplate).toBe("软件");
  });

  it("falls back to the global default", () => {
    expect(pickTemplateSettingRow(rows, "media")?.subjectTemplate).toBe("全局");
    expect(pickTemplateSettingRow(rows, null)?.subjectTemplate).toBe("全局");
    expect(pickTemplateSettingRow(rows, "  ")?.subjectTemplate).toBe("全局");
  });

  it("returns null when neither exists", () => {
    expect(pickTemplateSettingRow([], "software")).toBeNull();
  });
});

describe("templateReadFilter", () => {
  it("does not restrict admins", () => {
    expect(templateReadFilter(emailTemplateSetting.department, all)).toBeUndefined();
  });

  it("does not restrict department accounts either, so they can browse other departments", () => {
    /* 只读浏览其他部门要求读路径不过滤；写权限由 canEditTemplateRow 单独收口 */
    expect(templateReadFilter(emailTemplateSetting.department, software)).toBeUndefined();
    expect(templateReadFilter(emailTemplateSetting.department, office)).toBeUndefined();
  });

  it("shows only the global default without a department", () => {
    const { sql, params } = renderFilter(none);

    expect(sql).toContain('"email_template_setting"."department" is null');
    expect(params).toEqual([]);
  });
});

describe("canReadTemplateDepartment", () => {
  it("lets admins and department accounts read any department", () => {
    expect(canReadTemplateDepartment(all, null)).toBe(true);
    expect(canReadTemplateDepartment(all, "media")).toBe(true);
    expect(canReadTemplateDepartment(software, "media")).toBe(true);
    expect(canReadTemplateDepartment(software, "software")).toBe(true);
    expect(canReadTemplateDepartment(software, null)).toBe(true);
  });

  it("pins department-less accounts to the global default", () => {
    expect(canReadTemplateDepartment(none, null)).toBe(true);
    expect(canReadTemplateDepartment(none, "software")).toBe(false);
  });
});

describe("mergeTemplateDepartmentOptions", () => {
  it("lists the Link department directory plus stored override rows", () => {
    const options = mergeTemplateDepartmentOptions(["software", null, "custom_dept"]);

    /* 目录里的部门即使还没建过覆盖也要出现，方便直接切换过去 */
    expect(options).toContain("media");
    expect(options).toContain("office");
    expect(options).toContain("custom_dept");
    expect(new Set(options).size).toBe(options.length);
    expect([...options]).toEqual([...options].sort((a, b) => a.localeCompare(b, "zh-CN")));
  });
});
