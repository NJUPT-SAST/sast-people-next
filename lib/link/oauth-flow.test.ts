import { requiresLinkAdminAuthorization } from "./oauth-flow";

describe("Link OAuth authorization flow", () => {
  it.each([
    ["freshman", 0, false],
    ["member", 1, false],
    ["lecturer", 2, true],
    ["admin", 3, true],
  ])("requests management scopes only for %s", (_role, peopleRole, expected) => {
    expect(requiresLinkAdminAuthorization(peopleRole)).toBe(expected);
  });
});
