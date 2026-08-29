import {
  normalizeWithdrawalReason,
  WITHDRAWAL_REASON_MAX_LENGTH,
} from "./user-flow";

describe("normalizeWithdrawalReason", () => {
  it("trims and accepts a non-empty reason", () => {
    expect(normalizeWithdrawalReason("  时间冲突，请重新安排  ")).toEqual({
      success: true,
      value: "时间冲突，请重新安排",
    });
  });

  it("rejects a missing reason", () => {
    expect(normalizeWithdrawalReason("   ")).toEqual({
      success: false,
      error: "请填写退回理由。",
    });
  });

  it("rejects a reason over the maximum length", () => {
    expect(normalizeWithdrawalReason("a".repeat(WITHDRAWAL_REASON_MAX_LENGTH + 1))).toEqual({
      success: false,
      error: `退回理由不能超过 ${WITHDRAWAL_REASON_MAX_LENGTH} 字。`,
    });
  });
});
