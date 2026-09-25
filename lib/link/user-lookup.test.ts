import { findPeopleUserByStudentId } from "./user-lookup";

const listLinkUsers = jest.fn();
const getLinkAccessTokenFromSession = jest.fn();
const getLinkAdminAccessTokenFromSession = jest.fn();
const getCurrentUserProfile = jest.fn();

jest.mock("./admin", () => ({
  listLinkUsers: (...args: unknown[]) => listLinkUsers(...args),
  getLinkUserDetail: jest.fn(),
  getLinkUsersByIds: jest.fn(),
}));

jest.mock("./session", () => ({
  getLinkAccessTokenFromSession: (...args: unknown[]) =>
    getLinkAccessTokenFromSession(...args),
  getLinkAdminAccessTokenFromSession: (...args: unknown[]) =>
    getLinkAdminAccessTokenFromSession(...args),
}));

jest.mock("./user", () => ({
  getCurrentUserProfile: (...args: unknown[]) => getCurrentUserProfile(...args),
}));

jest.mock("./client", () => ({
  isLinkAuthorizationError: jest.fn(() => false),
}));

describe("findPeopleUserByStudentId", () => {
  beforeEach(() => {
    listLinkUsers.mockReset();
    getLinkAccessTokenFromSession.mockReset();
    getLinkAdminAccessTokenFromSession.mockReset();
    getCurrentUserProfile.mockReset();
    getLinkAccessTokenFromSession.mockResolvedValue("user-token");
    getLinkAdminAccessTokenFromSession.mockResolvedValue("admin-token");
    getCurrentUserProfile.mockRejectedValue(new Error("not available"));
  });

  it("tries lowercase and uppercase Link student-id variants", async () => {
    listLinkUsers
      .mockResolvedValueOnce({ users: [], total: 0, page: 1, page_size: 100 })
      .mockResolvedValueOnce({
        users: [
          {
            id: 8,
            name: "考生",
            student_id: " b260005 ",
            login_email: "candidate@example.com",
            role: "freshman",
            state: "njupter",
            phone_number: null,
            qq_number: null,
            college: null,
            major: null,
            department: null,
            created_at: "2026-01-01T00:00:00.000Z",
          },
        ],
        total: 1,
        page: 1,
        page_size: 100,
      });

    await expect(findPeopleUserByStudentId("B260005")).resolves.toMatchObject({
      id: 8,
      studentId: " b260005 ",
    });
    expect(listLinkUsers).toHaveBeenNthCalledWith(2, "admin-token", {
      page: 1,
      pageSize: 100,
      studentId: "b260005",
    });
  });

  it("finds a matching student on a later page without requesting more pages", async () => {
    listLinkUsers
      .mockResolvedValueOnce({
        users: [],
        total: 201,
        page: 1,
        page_size: 100,
      })
      .mockResolvedValueOnce({
        users: [
          {
            id: 9,
            name: "分页考生",
            student_id: "B260006",
            login_email: "paged@example.com",
            role: "freshman",
            state: "njupter",
            phone_number: null,
            qq_number: null,
            college: null,
            major: null,
            department: null,
            created_at: "2026-01-01T00:00:00.000Z",
          },
        ],
        total: 201,
        page: 2,
        page_size: 100,
      });

    await expect(findPeopleUserByStudentId("B260006")).resolves.toMatchObject({
      id: 9,
      studentId: "B260006",
    });
    expect(listLinkUsers).toHaveBeenCalledTimes(2);
    expect(listLinkUsers).toHaveBeenNthCalledWith(2, "admin-token", {
      page: 2,
      pageSize: 100,
      studentId: "B260006",
    });
  });
});
