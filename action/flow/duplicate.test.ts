import { createCopiedFlowTitle } from "./duplicate-utils";

describe("createCopiedFlowTitle", () => {
  it("adds a copy suffix to regular flow titles", () => {
    expect(createCopiedFlowTitle("2026 招新")).toBe("2026 招新 副本");
  });

  it("does not add duplicate copy suffixes", () => {
    expect(createCopiedFlowTitle("2026 招新 副本")).toBe("2026 招新 副本");
  });

  it("keeps copied titles within the database varchar limit", () => {
    expect(createCopiedFlowTitle("a".repeat(100))).toHaveLength(100);
  });
});
