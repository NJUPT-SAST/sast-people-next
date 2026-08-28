import { editFlowSchema } from "./flow";

const validFlow = {
  title: "测试流程",
  description: "测试描述",
  type: "recruitment_exemption" as const,
  startedAt: new Date("2026-08-28T00:00:00.000Z"),
  endedAt: new Date("2026-08-29T00:00:00.000Z"),
};

describe("editFlowSchema", () => {
  it("normalizes valid group option names", () => {
    const parsed = editFlowSchema.parse({
      ...validFlow,
      groupOptions: [" 前端组 ", "后端组"],
    });

    expect(parsed.groupOptions).toEqual(["前端组", "后端组"]);
  });

  it("rejects more than 30 group options", () => {
    expect(() =>
      editFlowSchema.parse({
        ...validFlow,
        groupOptions: Array.from({ length: 31 }, (_, index) => `组别 ${index}`),
      }),
    ).toThrow();
  });

  it("rejects group option names longer than 100 characters", () => {
    expect(() =>
      editFlowSchema.parse({
        ...validFlow,
        groupOptions: ["组".repeat(101)],
      }),
    ).toThrow();
  });
});
