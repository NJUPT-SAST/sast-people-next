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
    groupOptions: ["办公室", "科宣部", "外联部", "赛事部"],
    groupDepartments: {
      办公室: "office",
      科宣部: "publicity",
      外联部: "liaison",
      赛事部: "competition",
    },
  };

  it("requires the office department list and its mapping", () => {
    expect(() =>
      editFlowSchema.parse({ ...validFlow, type: "office_interview" as const }),
    ).toThrow("办公类部门面试招新请配置可投递的办公部门");
    expect(() =>
      editFlowSchema.parse({
        ...officeFlow,
        groupDepartments: { 办公室: "office" },
      }),
    ).toThrow("请为每个办公部门配置对应的部门标识");
  });

  it("accepts office departments and interview slots", () => {
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
