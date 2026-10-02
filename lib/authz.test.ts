/** @jest-environment node */

const mockGetSession = jest.fn();
const mockVerifySession = jest.fn();
const mockVerifyRole = jest.fn();

jest.mock("react", () => ({
  ...jest.requireActual("react"),
  cache: <T,>(fn: T) => fn,
}));

jest.mock("@/lib/session", () => ({
  getSession: (...args: unknown[]) => mockGetSession(...args),
}));

jest.mock("@/lib/dal", () => ({
  verifySession: (...args: unknown[]) => mockVerifySession(...args),
  verifyRole: (...args: unknown[]) => mockVerifyRole(...args),
}));

import {
  assertDepartmentAccess,
  canAccessDepartment,
  departmentScopeFilter,
  getDepartmentScope,
  isAdmin,
  verifyAdmin,
  verifyManager,
  verifyScopedRole,
  type DepartmentScope,
} from "./authz";
import { ADMIN_ROLE, MANAGER_ROLE } from "@/lib/link/role";
import { drizzle } from "drizzle-orm/node-postgres";
import { flow } from "@/db/schema";

const queryDb = drizzle({ client: {} as never });

const sessionOf = (role: number, department: string | null) => ({
  isAuth: true,
  uid: 11,
  name: "测试用户",
  role,
  department,
});

beforeEach(() => {
  mockGetSession.mockReset();
  mockVerifySession.mockReset();
  mockVerifyRole.mockReset();
});

describe("isAdmin", () => {
  it("只认 Link 的 admin 角色（role 4）", () => {
    expect(isAdmin(0)).toBe(false);
    expect(isAdmin(1)).toBe(false);
    expect(isAdmin(2)).toBe(false);
    expect(isAdmin(MANAGER_ROLE)).toBe(false);
    expect(isAdmin(ADMIN_ROLE)).toBe(true);
    expect(isAdmin(5)).toBe(true);
  });
});

describe("getDepartmentScope", () => {
  it("管理员拥有全部部门", async () => {
    mockVerifySession.mockResolvedValue(sessionOf(ADMIN_ROLE, null));

    await expect(getDepartmentScope()).resolves.toEqual({ kind: "all" });
    expect(mockGetSession).not.toHaveBeenCalled();
  });

  it("部长/讲师按本人所属部门收敛（读最新会话）", async () => {
    mockVerifySession.mockResolvedValue(sessionOf(MANAGER_ROLE, null));
    mockGetSession.mockResolvedValue({ department: "software" });

    await expect(getDepartmentScope()).resolves.toEqual({
      kind: "department",
      department: "software",
    });
  });

  it("没有部门的账号什么都看不到", async () => {
    mockVerifySession.mockResolvedValue(sessionOf(MANAGER_ROLE, null));
    mockGetSession.mockResolvedValue({ department: null });

    await expect(getDepartmentScope()).resolves.toEqual({ kind: "none" });
  });
});

describe("department access helpers", () => {
  const all: DepartmentScope = { kind: "all" };
  const own: DepartmentScope = { kind: "department", department: "software" };
  const none: DepartmentScope = { kind: "none" };

  it("未归属部门的数据只有管理员可见", () => {
    expect(canAccessDepartment(all, null)).toBe(true);
    expect(canAccessDepartment(own, null)).toBe(false);
    expect(canAccessDepartment(none, "software")).toBe(false);
    expect(canAccessDepartment(own, "software")).toBe(true);
    expect(canAccessDepartment(own, "media")).toBe(false);
  });

  it("跨部门访问抛错", () => {
    expect(() => assertDepartmentAccess(own, "media")).toThrow(
      "无权访问其他部门的数据",
    );
    expect(() => assertDepartmentAccess(own, "software")).not.toThrow();
    expect(() => assertDepartmentAccess(all, null)).not.toThrow();
  });

  it("把 scope 翻译成行过滤条件", () => {
    const renderFlowFilter = (scope: DepartmentScope) =>
      queryDb
        .select()
        .from(flow)
        .where(departmentScopeFilter(flow.department, scope))
        .toSQL();

    expect(departmentScopeFilter(flow.department, all)).toBeUndefined();
    expect(renderFlowFilter(none).sql).toContain("false");
    expect(renderFlowFilter(own).sql).toContain('"flow"."department" = $1');
    expect(renderFlowFilter(own).params).toEqual(["software"]);
  });
});

describe("verifyScopedRole / verifyManager / verifyAdmin", () => {
  it("无部门归属的角色被拒绝", async () => {
    mockVerifyRole.mockResolvedValue(sessionOf(MANAGER_ROLE, null));
    mockVerifySession.mockResolvedValue(sessionOf(MANAGER_ROLE, null));
    mockGetSession.mockResolvedValue({ department: null });

    await expect(verifyScopedRole(MANAGER_ROLE)).rejects.toThrow(
      "当前账号未归属任何部门，请联系管理员分配部门。",
    );
  });

  it("部长带着部门可以通过部门级校验", async () => {
    mockVerifyRole.mockResolvedValue(sessionOf(MANAGER_ROLE, "software"));
    mockVerifySession.mockResolvedValue(sessionOf(MANAGER_ROLE, "software"));
    mockGetSession.mockResolvedValue({ department: "software" });

    await expect(verifyManager()).resolves.toMatchObject({
      uid: 11,
      scope: { kind: "department", department: "software" },
    });
  });

  it("管理员校验只认 role 4", async () => {
    mockVerifySession.mockResolvedValue(sessionOf(MANAGER_ROLE, "software"));
    await expect(verifyAdmin()).rejects.toThrow("仅管理员可执行该操作");

    mockVerifySession.mockResolvedValue(sessionOf(ADMIN_ROLE, null));
    await expect(verifyAdmin()).resolves.toMatchObject({ role: ADMIN_ROLE });
  });
});
