import { isLinkAuthorizationError, LinkApiError } from "@/lib/link/client";

describe("Link authorization errors", () => {
  it("recognizes revoked authorization responses", () => {
    expect(isLinkAuthorizationError(new LinkApiError("revoked", 401))).toBe(true);
    expect(isLinkAuthorizationError(new LinkApiError("revoked", 403))).toBe(true);
    expect(
      isLinkAuthorizationError(new LinkApiError("revoked", 200, 4014905830)),
    ).toBe(true);
  });

  it("does not classify unrelated Link failures as authorization errors", () => {
    expect(isLinkAuthorizationError(new LinkApiError("unavailable", 500))).toBe(false);
    expect(isLinkAuthorizationError(new Error("unavailable"))).toBe(false);
  });
});
