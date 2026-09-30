/** @jest-environment node */

jest.mock("react", () => ({
  ...jest.requireActual("react"),
  cache: <T,>(fn: T) => fn,
}));

import {
  assertFlowEditable,
  assertUserFlowAccess,
  canEditFlow,
  canEditFlowRecord,
  resolveUserFlowDepartment,
  visibleFlowPredicate,
} from "./flow-access";
import type { DepartmentScope } from "./authz";
import { flow } from "@/db/schema";
import { drizzle } from "drizzle-orm/node-postgres";
import type { SQL } from "drizzle-orm";

const queryDb = drizzle({ client: {} as never });

const renderSql = (predicate: SQL<unknown> | undefined) =>
  queryDb.select().from(flow).where(predicate).toSQL();

describe("visibleFlowPredicate", () => {
  const all: DepartmentScope = { kind: "all" };
  const none: DepartmentScope = { kind: "none" };
  const software: DepartmentScope = { kind: "department", department: "software" };

  it("does not restrict admins", () => {
    expect(visibleFlowPredicate(all)).toBeUndefined();
  });

  it("hides everything from accounts without a department", () => {
    expect(renderSql(visibleFlowPredicate(none)).sql).toContain("false");
  });

  it("keeps own-department flows and shared flows holding own candidates", () => {
    const { sql, params } = renderSql(visibleFlowPredicate(software));

    expect(sql).toContain('"flow"."department" =');
    expect(sql).toContain("EXISTS");
    expect(sql).toContain('"user_flow"."department" =');
    expect(params).toEqual(["software", "software"]);
  });

  it("treats office departments like any other department", () => {
    const office = renderSql(
      visibleFlowPredicate({ kind: "department", department: "publicity" }),
    );
    const tech = renderSql(visibleFlowPredicate(software));

    /* 办公类流程不再按 type 放行其他部门的流程 */
    expect(office.sql).not.toContain('"flow"."type"');
    expect(office.sql).toBe(tech.sql);
    expect(office.params).toEqual(["publicity", "publicity"]);
  });
});

describe("flow edit rights", () => {
  const all: DepartmentScope = { kind: "all" };
  const software: DepartmentScope = { kind: "department", department: "software" };
  const none: DepartmentScope = { kind: "none" };

  it("allows only the owning department and admins", () => {
    expect(canEditFlow(software, "software")).toBe(true);
    expect(canEditFlow(software, "media")).toBe(false);
    expect(canEditFlow(software, null)).toBe(false);
    expect(canEditFlow(all, null)).toBe(true);
    expect(canEditFlow(none, "software")).toBe(false);
  });

  it("rejects cross-department writes with a message", () => {
    expect(() => assertFlowEditable(software, "media")).toThrow(
      "无权修改其他部门的流程",
    );
    expect(() => assertFlowEditable(software, "software")).not.toThrow();
  });

  it("keeps office flows inside their own department", () => {
    const publicity: DepartmentScope = { kind: "department", department: "publicity" };

    expect(
      canEditFlowRecord(publicity, { type: "office_interview", department: "publicity" }),
    ).toBe(true);
    expect(
      canEditFlowRecord(publicity, { type: "office_interview", department: "office" }),
    ).toBe(false);
    /* 旧的共享办公流程（department 为空）不再放行给办公部门 */
    expect(
      canEditFlowRecord(publicity, { type: "office_interview", department: null }),
    ).toBe(false);
    expect(canEditFlowRecord(all, { type: "office_interview", department: "office" })).toBe(true);
  });

  it("rejects candidates of other departments even for office flows", () => {
    const publicity: DepartmentScope = { kind: "department", department: "publicity" };

    expect(
      assertUserFlowAccess(publicity, {
        type: "office_interview",
        department: "publicity",
      }),
    ).toBeUndefined();
    expect(() =>
      assertUserFlowAccess(publicity, {
        type: "office_interview",
        department: "office",
      }),
    ).toThrow("无权操作其他部门的候选人");
    expect(() =>
      assertUserFlowAccess(publicity, {
        type: "office_interview",
        department: null,
      }),
    ).toThrow("无权操作其他部门的候选人");
  });
});

describe("resolveUserFlowDepartment", () => {
  it("prefers the group mapping", () => {
    expect(
      resolveUserFlowDepartment({ 前端组: "software" }, "前端组", "office"),
    ).toBe("software");
  });

  it("falls back to the flow department when the group has no mapping", () => {
    expect(resolveUserFlowDepartment({ 前端组: "software" }, "后端组", "media")).toBe(
      "media",
    );
    expect(resolveUserFlowDepartment(null, null, "media")).toBe("media");
  });

  it("returns null for unassigned flows and blanks", () => {
    expect(resolveUserFlowDepartment(null, "前端组", null)).toBeNull();
    expect(resolveUserFlowDepartment({ 前端组: "  " }, "前端组", null)).toBeNull();
    expect(resolveUserFlowDepartment(undefined, undefined, "   ")).toBeNull();
  });
});
