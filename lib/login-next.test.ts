/** @jest-environment node */

import { normalizeLoginNext } from "./login-next";

describe("normalizeLoginNext", () => {
  it("keeps internal paths with query and hash", () => {
    expect(normalizeLoginNext("/collect/abc?from=share#form")).toBe(
      "/collect/abc?from=share#form",
    );
    expect(normalizeLoginNext("  /dashboard/collection/1  ")).toBe(
      "/dashboard/collection/1",
    );
  });

  it("rejects absolute and protocol-relative URLs", () => {
    for (const value of [
      "https://evil.example",
      "//evil.example/path",
      "/\\evil.example",
      "javascript:alert(1)",
      "collect/abc",
      "",
      null,
      undefined,
    ]) {
      expect(normalizeLoginNext(value)).toBeNull();
    }
  });
});
