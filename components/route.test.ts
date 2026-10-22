import { getMenuGroups, getVisibleMenuItems, isItemActive } from "./route";
import { ADMIN_ROLE, LECTURER_ROLE, MANAGER_ROLE, MEMBER_ROLE } from "@/lib/link/role";

const pathsFor = (role: number, hasDepartment = true) =>
  getVisibleMenuItems(role, hasDepartment).map((item) => item.path);

describe("getVisibleMenuItems", () => {
  it("新同学与部员只有「我的」分组", () => {
    expect(pathsFor(0)).toEqual(["", "/user-flow", "/collection"]);
    expect(pathsFor(MEMBER_ROLE)).toEqual(["", "/user-flow", "/collection"]);
  });

  it("讲师看到阅卷与成员目录", () => {
    expect(pathsFor(LECTURER_ROLE)).toEqual([
      "",
      "/user-flow",
      "/collection",
      "/review",
      "/manage",
      "/exams",
      "/interviews",
    ]);
  });

  it("部长增加签到叫号、邮件中心、流程管理、面评审批与操作审计", () => {
    expect(pathsFor(MANAGER_ROLE)).toEqual([
      "",
      "/user-flow",
      "/collection",
      "/review/analytics",
      "/review",
      "/manage",
      "/exams",
      "/interviews",
      "/checkin",
      "/emails",
      "/flow",
      "/approvals",
      "/audit",
    ]);
  });

  it("管理员额外拥有反馈记录、错误日志与部门管理", () => {
    expect(pathsFor(ADMIN_ROLE)).toEqual([
      "",
      "/user-flow",
      "/collection",
      "/review/analytics",
      "/review",
      "/manage",
      "/exams",
      "/interviews",
      "/checkin",
      "/emails",
      "/flow",
      "/departments",
      "/approvals",
      "/audit",
      "/feedback",
      "/error-log",
    ]);
  });

  it("无部门归属的账号看不到会被重定向的部门级入口（成员目录不受限）", () => {
    expect(pathsFor(LECTURER_ROLE, false)).toEqual([
      "",
      "/user-flow",
      "/collection",
      "/manage",
    ]);
    expect(pathsFor(MANAGER_ROLE, false)).toEqual([
      "",
      "/user-flow",
      "/collection",
      "/manage",
    ]);
    expect(pathsFor(ADMIN_ROLE, false)).toEqual(
      expect.arrayContaining(["/review", "/flow", "/emails", "/departments"]),
    );
  });

  it("部门管理入口挂在管理分组", () => {
    const manageGroup = getMenuGroups(ADMIN_ROLE).find((group) => group.id === "manage");

    expect(manageGroup?.items.map((item) => item.path)).toContain("/departments");
    expect(
      getMenuGroups(MANAGER_ROLE)
        .find((group) => group.id === "manage")
        ?.items.map((item) => item.path),
    ).not.toContain("/departments");
  });

  it("无部门账号仍能看到成员目录，但看不到流程/邮件/审计", () => {
    const manageGroup = getMenuGroups(MANAGER_ROLE, false).find((group) => group.id === "manage");

    expect(manageGroup?.items.map((item) => item.path)).toEqual(["/manage"]);
  });
});

describe("isItemActive", () => {
  it("子路径只点亮最长匹配的菜单项（不会同时点亮 /review 与 /review/analytics）", () => {
    expect(isItemActive("/dashboard/review/analytics", "/review/analytics")).toBe(true);
    expect(isItemActive("/dashboard/review/analytics", "/review")).toBe(false);
  });

  it("父路径自己的页面仍然只点亮父项", () => {
    expect(isItemActive("/dashboard/review", "/review")).toBe(true);
    expect(isItemActive("/dashboard/review", "/review/analytics")).toBe(false);
    expect(isItemActive("/dashboard/review/marking", "/review")).toBe(true);
    expect(isItemActive("/dashboard/review/marking", "/review/analytics")).toBe(false);
  });

  it("不匹配的路径不点亮任何项，工作台首页只点亮空路径项", () => {
    expect(isItemActive("/dashboard/exams", "/review")).toBe(false);
    expect(isItemActive("/dashboard", "")).toBe(true);
    expect(isItemActive("/dashboard/exams", "")).toBe(false);
  });
});
