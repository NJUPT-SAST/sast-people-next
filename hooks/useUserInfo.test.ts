/** @jest-environment node */

jest.mock("server-only", () => ({}));
jest.mock("react", () => ({
  ...jest.requireActual("react"),
  cache: (fn: unknown) => fn,
}));
jest.mock("@/lib/dal", () => ({ verifySession: jest.fn() }));
jest.mock("next/navigation", () => ({ redirect: jest.fn() }));
jest.mock("@/lib/link/client", () => ({ isLinkAuthorizationError: jest.fn() }));
jest.mock("@/lib/link/user", () => ({ getCurrentUserProfile: jest.fn() }));
jest.mock("@/lib/link/session", () => ({
  getLinkAccessTokenFromSession: jest.fn(),
  MissingLinkAccessTokenError: class MissingLinkAccessTokenError extends Error {},
}));
jest.mock("@/lib/link/people-user", () => ({
  toPeopleUserFromLinkProfile: jest.fn(() => ({ id: 1, name: "Link User" })),
}));
jest.mock("@/lib/server-error-log", () => ({
  isNextControlFlowError: jest.fn(
    (err: unknown) => err instanceof Error && err.message === "NEXT_REDIRECT",
  ),
  logServerError: jest.fn(),
}));

import { useUserInfo } from "@/hooks/useUserInfo";

const { verifySession: mockVerifySession } = jest.requireMock("@/lib/dal") as {
  verifySession: jest.Mock;
};
const { redirect: mockRedirect } = jest.requireMock("next/navigation") as {
  redirect: jest.Mock;
};
const { getLinkAccessTokenFromSession: mockGetToken } = jest.requireMock(
  "@/lib/link/session",
) as { getLinkAccessTokenFromSession: jest.Mock };
const { getCurrentUserProfile: mockGetProfile } = jest.requireMock(
  "@/lib/link/user",
) as { getCurrentUserProfile: jest.Mock };
const { isLinkAuthorizationError: mockIsAuthError } = jest.requireMock(
  "@/lib/link/client",
) as { isLinkAuthorizationError: jest.Mock };
const { logServerError: mockLog } = jest.requireMock(
  "@/lib/server-error-log",
) as { logServerError: jest.Mock };

const session = {
  isAuth: true as const,
  uid: 7,
  role: 2,
  realRole: 2,
  viewAs: null,
  name: "Alice",
  department: "software",
};

describe("useUserInfo", () => {
  beforeEach(() => {
    mockVerifySession.mockResolvedValue(session);
    mockGetToken.mockResolvedValue("link-access-token");
    mockGetProfile.mockResolvedValue({ id: 7, name: "Alice" });
    mockIsAuthError.mockReturnValue(false);
    mockRedirect.mockImplementation(() => {
      throw new Error("NEXT_REDIRECT");
    });
    mockLog.mockReset();
  });

  it("falls back to session identity instead of failing the render when Link is unreachable", async () => {
    const networkError = new TypeError("fetch failed");
    mockGetProfile.mockRejectedValue(networkError);

    await expect(useUserInfo()).resolves.toEqual(
      expect.objectContaining({
        id: 7,
        name: "Alice",
        role: 2,
        departments: ["software"],
        profileUnavailable: true,
      }),
    );
    expect(mockLog).toHaveBeenCalledWith(
      "dashboard:useUserInfo",
      networkError,
      expect.objectContaining({ action: "load-current-user" }),
    );
  });

  it("still forces re-authorization when Link rejects the session", async () => {
    mockIsAuthError.mockReturnValue(true);
    mockGetProfile.mockRejectedValue(new Error("revoked"));

    await expect(useUserInfo()).rejects.toThrow("NEXT_REDIRECT");
    expect(mockRedirect).toHaveBeenCalledWith(
      "/api/auth/logout?reason=link-authorization",
    );
  });
});
