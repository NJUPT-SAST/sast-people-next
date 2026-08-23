import { externalHref, isValidExternalUrl } from "./link";

describe("externalHref", () => {
  it("normalizes http and https links", () => {
    expect(externalHref("example.com/path")).toBe("https://example.com/path");
    expect(externalHref("http://example.com/path")).toBe("http://example.com/path");
  });

  it("rejects non-web protocols and invalid links", () => {
    expect(externalHref("javascript:alert(1)")).toBe("");
    expect(externalHref("data:text/html,<script>alert(1)</script>")).toBe("");
    expect(externalHref("https://exa mple.com")).toBe("");
  });
});

describe("isValidExternalUrl", () => {
  it("allows empty values and web URLs", () => {
    expect(isValidExternalUrl("")).toBe(true);
    expect(isValidExternalUrl("example.com/work")).toBe(true);
    expect(isValidExternalUrl("https://example.com/work")).toBe(true);
  });

  it("rejects malformed and non-web URLs", () => {
    expect(isValidExternalUrl("not a url")).toBe(false);
    expect(isValidExternalUrl("javascript:alert(1)")).toBe(false);
    expect(isValidExternalUrl("https://")).toBe(false);
  });
});
