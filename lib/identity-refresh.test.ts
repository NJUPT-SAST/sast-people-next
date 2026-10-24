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
  getCurrentUserProfileWithRefresh: jest.fn(),
}));
jest.mock("@/lib/link/people-user", () => ({
  toPeopleUserFromLinkProfile: jest.fn(),
}));

import { MissingLinkAccessTokenError } from "@/lib/link/session";
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
const { getCurrentUserProfileWithRefresh: mockGetProfile } = jest.requireMock(
  "@/lib/link/user",
) as { getCurrentUserProfileWithRefresh: jest.Mock };
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

  it("uses the refresh-aware profile loader and syncs identity", async () => {
    await expect(refreshSessionIdentityIfStale()).resolves.toBe(true);

    expect(mockGetProfile).toHaveBeenCalledWith("access-token");
    expect(mockSyncIdentity).toHaveBeenCalledWith({
      role: 2,
      department: "software",
    });
  });

  it("skips sync when the session has no Link access token", async () => {
    mockGetToken.mockRejectedValue(new MissingLinkAccessTokenError());

    await expect(refreshSessionIdentityIfStale()).resolves.toBe(false);
    expect(mockGetProfile).not.toHaveBeenCalled();
    expect(mockSyncIdentity).not.toHaveBeenCalled();
  });

  it("propagates non-auth failures without syncing", async () => {
    const failure = new Error("Link unavailable");
    mockGetProfile.mockRejectedValue(failure);

    await expect(refreshSessionIdentityIfStale()).rejects.toBe(failure);
    expect(mockSyncIdentity).not.toHaveBeenCalled();
  });
});
