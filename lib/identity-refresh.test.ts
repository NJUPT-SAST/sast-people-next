/** @jest-environment node */

jest.mock("server-only", () => ({}));
jest.mock("@/lib/session", () => ({
  getSession: jest.fn(),
  isIdentitySyncStale: jest.fn(),
  syncCurrentSessionIdentity: jest.fn(),
}));
jest.mock("@/lib/link/session", () => ({
  getLinkAccessTokenFromSession: jest.fn(),
  MissingLinkAccessTokenError: class MissingLinkAccessTokenError extends Error {},
}));
jest.mock("@/lib/link/user", () => ({
  getCurrentUserProfile: jest.fn(),
}));
jest.mock("@/lib/link/people-user", () => ({
  toPeopleUserFromLinkProfile: jest.fn(),
}));

import { LinkApiError } from "@/lib/link/client";
import { refreshSessionIdentityIfStale } from "@/lib/identity-refresh";

const { getSession: mockGetSession, isIdentitySyncStale: mockIsStale, syncCurrentSessionIdentity: mockSyncIdentity } =
  jest.requireMock("@/lib/session") as {
    getSession: jest.Mock;
    isIdentitySyncStale: jest.Mock;
    syncCurrentSessionIdentity: jest.Mock;
  };
const { getLinkAccessTokenFromSession: mockGetToken } = jest.requireMock(
  "@/lib/link/session",
) as { getLinkAccessTokenFromSession: jest.Mock };
const { getCurrentUserProfile: mockGetProfile } = jest.requireMock(
  "@/lib/link/user",
) as { getCurrentUserProfile: jest.Mock };
const { toPeopleUserFromLinkProfile: mockToPeopleUser } = jest.requireMock(
  "@/lib/link/people-user",
) as { toPeopleUserFromLinkProfile: jest.Mock };

const session = {
  id: "session-1",
  uid: 7,
  name: "Alice",
  role: 2,
  realRole: 2,
  department: "media",
  departmentSyncedAt: null,
};

describe("refreshSessionIdentityIfStale", () => {
  beforeEach(() => {
    mockGetSession.mockResolvedValue(session);
    mockIsStale.mockReturnValue(true);
    mockGetToken.mockResolvedValue("access-token");
    mockGetProfile.mockResolvedValue({ id: 7 });
    mockToPeopleUser.mockReturnValue({ role: 2, departments: ["software"] });
  });

  it("refreshes and retries once when Link revokes a still-valid access token", async () => {
    mockGetToken.mockReset();
    mockGetToken.mockResolvedValueOnce("revoked-token").mockResolvedValueOnce(
      "fresh-token",
    );
    mockGetProfile
      .mockRejectedValueOnce(new LinkApiError("Access Token 无效或已被撤销", 401))
      .mockResolvedValueOnce({ id: 7 });

    await expect(refreshSessionIdentityIfStale()).resolves.toBe(true);

    expect(mockGetToken).toHaveBeenNthCalledWith(2, { forceRefresh: true });
    expect(mockGetProfile).toHaveBeenNthCalledWith(2, "fresh-token");
    expect(mockSyncIdentity).toHaveBeenCalledWith({
      role: 2,
      department: "software",
    });
  });

  it("also retries when Link encapsulates the revocation in a 200 envelope", async () => {
    mockGetToken.mockReset();
    mockGetToken.mockResolvedValueOnce("revoked-token").mockResolvedValueOnce(
      "fresh-token",
    );
    mockGetProfile
      .mockRejectedValueOnce(
        new LinkApiError("Access Token 无效或已被撤销", 200, 4014905830),
      )
      .mockResolvedValueOnce({ id: 7 });

    await expect(refreshSessionIdentityIfStale()).resolves.toBe(true);
    expect(mockGetToken).toHaveBeenNthCalledWith(2, { forceRefresh: true });
  });

  it("does not retry non-401 failures", async () => {
    const failure = new LinkApiError("Link unavailable", 503);
    mockGetProfile.mockRejectedValue(failure);

    await expect(refreshSessionIdentityIfStale()).rejects.toBe(failure);
    expect(mockGetToken).toHaveBeenCalledTimes(1);
    expect(mockSyncIdentity).not.toHaveBeenCalled();
  });
});
