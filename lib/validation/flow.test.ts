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

describe("editFlowSchema office interview", () => {
  const officeFlow = {
    ...validFlow,
    type: "office_interview" as const,
    department: "office" as const,
  };

  it("accepts an office flow with only a department and interview slots", () => {
    const parsed = editFlowSchema.parse({
      ...officeFlow,
      slotOptions: [
        { label: " 13:00-14:00 " },
        { label: "时间冲突，约面时间QQ群中另行通知", isConflict: true },
      ],
    });

    expect(parsed.slotOptions).toEqual([
      { label: "13:00-14:00" },
      { label: "时间冲突，约面时间QQ群中另行通知", isConflict: true },
    ]);
  });

  it("does not require a group list or mapping for office flows", () => {
    expect(() =>
      editFlowSchema.parse({
        ...validFlow,
        type: "office_interview" as const,
        department: "office" as const,
      }),
    ).not.toThrow();
  });

  it("rejects duplicate slot labels", () => {
    expect(() =>
      editFlowSchema.parse({
        ...officeFlow,
        slotOptions: [{ label: "13:00-14:00" }, { label: "13:00-14:00" }],
      }),
    ).toThrow("时段名称不能重复");
  });

  it("rejects interview slots on other flow types", () => {
    expect(() =>
      editFlowSchema.parse({
        ...validFlow,
        slotOptions: [{ label: "13:00-14:00" }],
      }),
    ).toThrow("只有办公类部门面试招新支持面试时段");
  });
});
