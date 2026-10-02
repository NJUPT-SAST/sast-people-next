/** @jest-environment node */

import {
  getMockCurrentUserProfile,
  listMockLoginAccounts,
  listMockUsers,
  mockAccessTokenFor,
  updateMockUserDepartments,
} from "./mock";

describe("mock Link department accounts", () => {
  it("seeds one admin, and a manager/lecturer/members per department", async () => {
    const accounts = listMockLoginAccounts();

    const admin = accounts.find((account) => account.studentId === "B00000000");
    expect(admin).toMatchObject({ name: "管理员", role: "admin", department: null });

    for (const index of [1, 2, 3, 4, 5, 6, 7]) {
      const managers = accounts.filter(
        (account) =>
          account.studentId === `B${index}${String(index).repeat(7)}` &&
          account.role === "manager",
      );
      expect(managers).toHaveLength(1);

      const departmentMembers = accounts.filter(
        (account) => account.studentId.startsWith(`B${index}0`) && account.role !== "manager",
      );
      expect(departmentMembers.map((account) => account.role)).toEqual([
        "lecturer",
        "member",
        "member",
      ]);
      expect(new Set(departmentMembers.map((account) => account.department)).size).toBe(1);
    }
  });

  it("updates a member's department in the mock Link store", async () => {
    const [freshman] = (
      await listMockUsers({ studentId: "B00040005", pageSize: 1 })
    ).users;
    expect(freshman).toBeDefined();
    const originalDepartment = freshman.department;

    const result = await updateMockUserDepartments([freshman.id], "office");
    expect(result.results).toEqual([
      { id: freshman.id, success: true, department: "office" },
    ]);
    const [updated] = (
      await listMockUsers({ studentId: "B00040005", pageSize: 1 })
    ).users;
    expect(updated.department).toBe("office");

    /* 还原，避免影响同文件的其他用例 */
    await updateMockUserDepartments([freshman.id], originalDepartment ?? null);
  });

  it("resolves the current user from the mock access token", async () => {
    const [departmentAdmin] = (
      await listMockUsers({ studentId: "B33333333", pageSize: 1 })
    ).users;

    await expect(getMockCurrentUserProfile(mockAccessTokenFor(departmentAdmin.id))).resolves.toMatchObject({
      id: departmentAdmin.id,
      student_id: "B33333333",
      profile: { department: "electronics" },
    });
    await expect(getMockCurrentUserProfile("mock-link-access-token")).resolves.toMatchObject({
      id: 1,
    });
    await expect(getMockCurrentUserProfile(null)).resolves.toMatchObject({ id: 1 });
  });

  it("filters the member directory per department", async () => {
    const software = await listMockUsers({ department: "software", pageSize: 100 });
    const media = await listMockUsers({ department: "media", pageSize: 100 });

    expect(software.users.length).toBeGreaterThan(0);
    expect(media.users.length).toBeGreaterThan(0);
    expect(software.users.every((user) => user.department === "software")).toBe(true);
    expect(media.users.every((user) => user.department === "media")).toBe(true);
  });
});
