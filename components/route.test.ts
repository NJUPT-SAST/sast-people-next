import { getMenuGroups, getVisibleMenuItems } from "./route";
import { ADMIN_ROLE, LECTURER_ROLE, MANAGER_ROLE, MEMBER_ROLE } from "@/lib/link/role";

const pathsFor = (role: number, hasDepartment = true) =>
  getVisibleMenuItems(role, hasDepartment).map((item) => item.path);

describe("getVisibleMenuItems", () => {
  it("新同学与部员只有「我的」分组", () => {
    expect(pathsFor(0)).toEqual(["", "/user-flow"]);
    expect(pathsFor(MEMBER_ROLE)).toEqual(["", "/user-flow"]);
  });

  it("讲师看到阅卷与成员目录", () => {
    expect(pathsFor(LECTURER_ROLE)).toEqual([
      "",
      "/user-flow",
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
    expect(pathsFor(LECTURER_ROLE, false)).toEqual(["", "/user-flow", "/manage"]);
    expect(pathsFor(MANAGER_ROLE, false)).toEqual(["", "/user-flow", "/manage"]);
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
