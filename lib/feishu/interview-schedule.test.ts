import { isFeishuEventNotFoundError } from "@/lib/feishu/interview-schedule";

describe("Feishu interview schedule errors", () => {
  it("recognizes event-not-found responses returned directly by the SDK", () => {
    expect(isFeishuEventNotFoundError({ code: 193001, msg: "event not found" })).toBe(true);
  });

  it("recognizes event-not-found errors wrapped in an HTTP response", () => {
    expect(
      isFeishuEventNotFoundError({
        response: { data: { code: 193001, msg: "event not found" } },
      }),
    ).toBe(true);
  });

  it("recognizes events manually deleted in Feishu", () => {
    expect(
      isFeishuEventNotFoundError({ code: 193003, msg: "event is deleted" }),
    ).toBe(true);
  });

  it("does not hide unrelated Feishu errors", () => {
    expect(isFeishuEventNotFoundError({ code: 999999, msg: "permission denied" })).toBe(false);
  });
});
