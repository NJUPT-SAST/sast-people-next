import { parseOperationAuditDate } from "@/lib/operation-audit-list";

describe("parseOperationAuditDate", () => {
  it("rejects impossible calendar dates", () => {
    expect(parseOperationAuditDate("2026-02-31")).toBeNull();
    expect(parseOperationAuditDate("2026-13-01", true)).toBeNull();
  });

  it("parses valid dates at the Beijing day boundary", () => {
    expect(parseOperationAuditDate("2026-08-24")?.toISOString()).toBe("2026-08-23T16:00:00.000Z");
    expect(parseOperationAuditDate("2026-08-24", true)?.toISOString()).toBe("2026-08-24T15:59:59.999Z");
  });
});
