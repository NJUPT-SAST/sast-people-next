import {
  requireBooleanInput,
  requirePositiveIntegerArrayInput,
  requirePositiveIntegerInput,
} from "./action-input";

describe("email action input validation", () => {
  it("accepts positive safe integer ids", () => {
    expect(requirePositiveIntegerInput(12, "邮件批次 ID")).toBe(12);
  });

  it("rejects invalid ids", () => {
    for (const value of [0, -1, 1.2, Number.MAX_SAFE_INTEGER + 1, "1"]) {
      expect(() => requirePositiveIntegerInput(value, "邮件批次 ID")).toThrow(
        "邮件批次 ID不正确。",
      );
    }
  });

  it("accepts booleans only", () => {
    expect(requireBooleanInput(true, "结果通知类型")).toBe(true);
    expect(requireBooleanInput(false, "结果通知类型")).toBe(false);
    expect(() => requireBooleanInput("true", "结果通知类型")).toThrow(
      "结果通知类型不正确。",
    );
  });

  it("deduplicates positive id arrays", () => {
    expect(requirePositiveIntegerArrayInput([3, 3, 4], "收件人用户 ID")).toEqual([
      3,
      4,
    ]);
  });

  it("rejects empty or invalid id arrays", () => {
    expect(() => requirePositiveIntegerArrayInput([], "收件人用户 ID")).toThrow(
      "收件人用户 ID不能为空。",
    );
    expect(() =>
      requirePositiveIntegerArrayInput([1, "2"], "收件人用户 ID"),
    ).toThrow("收件人用户 ID不正确。");
  });
});
