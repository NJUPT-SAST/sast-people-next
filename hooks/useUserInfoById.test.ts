/** @jest-environment node */

import { verifyRole } from "@/lib/dal";
import { getLinkUserDetail } from "@/lib/link/admin";
import { toPeopleUserFromLinkProfile } from "@/lib/link/people-user";
import { useUserInfoById } from "./useUserInfoById";

jest.mock("@/lib/dal", () => ({ verifyRole: jest.fn() }));
jest.mock("@/lib/link/admin", () => ({ getLinkUserDetail: jest.fn() }));
jest.mock("@/lib/link/people-user", () => ({
  toPeopleUserFromLinkProfile: jest.fn((profile: { id: number }) => ({ id: profile.id })),
}));
jest.mock("@/lib/link/session", () => ({
  getLinkAdminAccessTokenFromSession: jest.fn().mockResolvedValue("admin-token"),
}));

const mockVerifyRole = jest.mocked(verifyRole);
const mockGetLinkUserDetail = jest.mocked(getLinkUserDetail);
const mockToPeopleUser = jest.mocked(toPeopleUserFromLinkProfile);

beforeEach(() => {
  jest.clearAllMocks();
  mockGetLinkUserDetail.mockResolvedValue({
    id: 5,
    name: "李瑶",
    role: "member",
    state: "on-sast",
    profile: { department: null },
  } as never);
});

describe("useUserInfoById", () => {
  it("讲师可以查看任意部门的成员（目录不限部门）", async () => {
    mockVerifyRole.mockResolvedValue({ uid: 20, role: 2, name: "讲师", department: "media" } as never);
    mockGetLinkUserDetail.mockResolvedValue({
      id: 5,
      name: "陈屹",
      role: "manager",
      state: "on-sast",
      profile: { department: "software" },
      phone_number: "13800000000",
      qq_number: "123456",
    } as never);

    await expect(useUserInfoById(5)).resolves.toMatchObject({ id: 5 });
  });

  it("手机号仅部长及以上可见，QQ 讲师可见", async () => {
    mockVerifyRole.mockResolvedValue({ uid: 20, role: 2, name: "讲师", department: null } as never);
    mockGetLinkUserDetail.mockResolvedValue({
      id: 5,
      name: "陈屹",
      role: "manager",
      state: "on-sast",
      profile: { department: "software" },
      phone_number: "13800000000",
      qq_number: "123456",
    } as never);

    await useUserInfoById(5);

    expect(mockToPeopleUser).toHaveBeenCalledWith(
      expect.objectContaining({ id: 5 }),
      false,
    );
  });

  it("成员不存在时报错", async () => {
    mockVerifyRole.mockResolvedValue({ uid: 20, role: 3, name: "部长", department: "software" } as never);
    mockGetLinkUserDetail.mockResolvedValue(null as never);

    await expect(useUserInfoById(999)).rejects.toThrow("User not found");
  });
});
