export const WITHDRAWAL_REASON_MAX_LENGTH = 500;

export const normalizeWithdrawalReason = (value: unknown) => {
  const normalized = typeof value === "string" ? value.trim() : "";

  if (!normalized) {
    return { success: false as const, error: "请填写退回理由。" };
  }

  if (normalized.length > WITHDRAWAL_REASON_MAX_LENGTH) {
    return {
      success: false as const,
      error: `退回理由不能超过 ${WITHDRAWAL_REASON_MAX_LENGTH} 字。`,
    };
  }

  return { success: true as const, value: normalized };
};

