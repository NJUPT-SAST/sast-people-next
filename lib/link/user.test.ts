/** @jest-environment node */

import type * as LinkClientModule from "@/lib/link/client";

jest.mock("server-only", () => ({}));
jest.mock("@/lib/link/client", () => {
  const actual = jest.requireActual("@/lib/link/client") as typeof LinkClientModule;
  return {
    ...actual,
    shouldUseMockLink: () => false,
    linkFetch: jest.fn(),
  };
});
jest.mock("@/lib/link/mock", () => ({ getMockCurrentUserProfile: jest.fn() }));
jest.mock("@/lib/link/session", () => ({
  getLinkAccessTokenFromSession: jest.fn(),
}));

import { LinkApiError } from "@/lib/link/client";
import { getCurrentUserProfileWithRefresh } from "./user";

const { linkFetch: mockLinkFetch } = jest.requireMock("@/lib/link/client") as {
  linkFetch: jest.Mock;
};
const { getLinkAccessTokenFromSession: mockGetToken } = jest.requireMock(
  "@/lib/link/session",
) as { getLinkAccessTokenFromSession: jest.Mock };

describe("getCurrentUserProfileWithRefresh", () => {
  beforeEach(() => {
    mockLinkFetch.mockReset();
    mockGetToken.mockReset();
  });

  it("uses the provided token without reading the session", async () => {
    mockLinkFetch.mockResolvedValue({ id: 7 });

    await expect(getCurrentUserProfileWithRefresh("token-a")).resolves.toEqual({
      id: 7,
    });
    expect(mockGetToken).not.toHaveBeenCalled();
    expect(mockLinkFetch).toHaveBeenCalledWith("/user/profile", {
      accessToken: "token-a",
    });
  });

  it("force-refreshes and retries once on HTTP 401", async () => {
    mockLinkFetch
      .mockRejectedValueOnce(new LinkApiError("Access Token 无效或已被撤销", 401))
      .mockResolvedValueOnce({ id: 7 });
    mockGetToken.mockResolvedValueOnce("fresh-token");

    await expect(getCurrentUserProfileWithRefresh("revoked-token")).resolves.toEqual({
      id: 7,
    });
    expect(mockGetToken).toHaveBeenCalledWith({ forceRefresh: true });
    expect(mockLinkFetch).toHaveBeenNthCalledWith(2, "/user/profile", {
      accessToken: "fresh-token",
    });
  });

  it("also retries when the revocation arrives in a 200 envelope", async () => {
    mockLinkFetch
      .mockRejectedValueOnce(
        new LinkApiError("Access Token 无效或已被撤销", 200, 4014905830),
      )
      .mockResolvedValueOnce({ id: 7 });
    mockGetToken.mockResolvedValueOnce("fresh-token");

    await expect(getCurrentUserProfileWithRefresh("revoked-token")).resolves.toEqual({
      id: 7,
    });
    expect(mockGetToken).toHaveBeenCalledWith({ forceRefresh: true });
  });

  it("does not refresh on other failures", async () => {
    const failure = new LinkApiError("Link unavailable", 503);
    mockLinkFetch.mockRejectedValue(failure);

    await expect(getCurrentUserProfileWithRefresh("token-a")).rejects.toBe(failure);
    expect(mockGetToken).not.toHaveBeenCalled();
  });

  it("propagates missing-token errors before calling Link", async () => {
    mockGetToken.mockRejectedValue(new Error("missing token"));

    await expect(getCurrentUserProfileWithRefresh()).rejects.toThrow("missing token");
    expect(mockLinkFetch).not.toHaveBeenCalled();
  });
});
