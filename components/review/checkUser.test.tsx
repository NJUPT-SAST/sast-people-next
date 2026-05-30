import { checkUserByStuID, findUserByUid } from "./checkUser";

const findPeopleUserByStudentId = jest.fn();
const getPeopleUserByLinkId = jest.fn();

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
  });

  it("returns whether a student id exists", async () => {
    findPeopleUserByStudentId.mockResolvedValueOnce({ id: 1 }).mockResolvedValueOnce(null);

    await expect(checkUserByStuID("2026001")).resolves.toBe(true);
    await expect(checkUserByStuID("2026999")).resolves.toBe(false);
  });

  it("returns a single user or throws when the lookup is invalid", async () => {
    getPeopleUserByLinkId
      .mockResolvedValueOnce({ id: 3, name: "张三" })
      .mockRejectedValueOnce(new Error("not found"));

    await expect(findUserByUid(3)).resolves.toEqual({ id: 3, name: "张三" });
    await expect(findUserByUid(999)).rejects.toThrow("错误的考生学号，请重新输入或扫描");
  });
});
