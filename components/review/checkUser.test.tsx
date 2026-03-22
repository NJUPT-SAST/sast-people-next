import { checkUserByStuID, findUserByUid } from "./checkUser";

const where = jest.fn();
const from = jest.fn(() => ({ where }));

jest.mock("@/db/drizzle", () => ({
  db: {
    select: () => ({ from }),
  },
}));

jest.mock("@/db/schema", () => ({
  user: {
    studentId: "studentId",
    id: "id",
  },
}));

jest.mock("drizzle-orm", () => ({
  eq: jest.fn(() => "condition"),
}));

describe("checkUser helpers", () => {
  beforeEach(() => {
    where.mockReset();
  });

  it("returns whether a student id exists", async () => {
    where.mockResolvedValueOnce([{ id: 1 }]).mockResolvedValueOnce([]);

    await expect(checkUserByStuID("2026001")).resolves.toBe(true);
    await expect(checkUserByStuID("2026999")).resolves.toBe(false);
  });

  it("returns a single user or throws when the lookup is invalid", async () => {
    where.mockResolvedValueOnce([{ id: 3, name: "张三" }]).mockResolvedValueOnce([]);

    await expect(findUserByUid(3)).resolves.toEqual({ id: 3, name: "张三" });
    await expect(findUserByUid(999)).rejects.toThrow("错误的考生学号，请重新输入或扫描");
  });
});
