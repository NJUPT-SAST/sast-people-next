import { findUserByStuID, findUserByUid } from "./checkUser";

const findPeopleUserByStudentId = jest.fn();
const getPeopleUserByLinkId = jest.fn();
const verifyScopedRole = jest.fn();

jest.mock("@/lib/authz", () => ({
  verifyScopedRole: (...args: Parameters<typeof verifyScopedRole>) =>
    verifyScopedRole(...args),
}));

jest.mock("@/lib/link/user-lookup", () => ({
  findPeopleUserByStudentId: (...args: Parameters<typeof findPeopleUserByStudentId>) =>
    findPeopleUserByStudentId(...args),
  getPeopleUserByLinkId: (...args: Parameters<typeof getPeopleUserByLinkId>) =>
    getPeopleUserByLinkId(...args),
}));

describe("checkUser helpers", () => {
  beforeEach(() => {
    findPeopleUserByStudentId.mockReset();
    getPeopleUserByLinkId.mockReset();
    verifyScopedRole.mockReset();
    verifyScopedRole.mockResolvedValue({
      uid: 1,
      role: 2,
      scope: { kind: "department", department: "software" },
    });
  });

  it("requires a 讲师-level session before looking a candidate up", async () => {
    findPeopleUserByStudentId.mockResolvedValueOnce(null);

    await findUserByStuID("2026001");

    expect(verifyScopedRole).toHaveBeenCalledWith(2);
  });

  it("does not reach Link when the caller lacks the role", async () => {
    verifyScopedRole.mockRejectedValueOnce(new Error("Unauthorized operation"));

    await expect(findUserByStuID("2026001")).rejects.toThrow("Unauthorized operation");
    expect(findPeopleUserByStudentId).not.toHaveBeenCalled();
  });

  it("returns a single user or throws when the lookup is invalid", async () => {
    getPeopleUserByLinkId
      .mockResolvedValueOnce({ id: 3, name: "张三" })
      .mockRejectedValueOnce(new Error("not found"));

    await expect(findUserByUid(3)).resolves.toEqual({ id: 3, name: "张三" });
    await expect(findUserByUid(999)).rejects.toThrow("错误的考生学号，请重新输入或扫描");
  });
});