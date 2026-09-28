/** @jest-environment node */

import {
  canEditTemplateRow,
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
const none: DepartmentScope = { kind: "none" };

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

  it("shows the global default plus own overrides to department accounts", () => {
    const { sql, params } = renderFilter(software);

    expect(sql).toContain('"email_template_setting"."department" is null');
    expect(sql).toContain("or");
    expect(params).toEqual(["software"]);
  });

  it("shows only the global default without a department", () => {
    const { sql, params } = renderFilter(none);

    expect(sql).toContain('"email_template_setting"."department" is null');
    expect(params).toEqual([]);
  });
});
