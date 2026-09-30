import { resolveLatestPassedDepartments } from "./flow-result-department";

describe("resolveLatestPassedDepartments", () => {
  it("assigns the department of the passed flow", () => {
    const result = resolveLatestPassedDepartments([
      {
        uid: 5,
        flowDepartment: "office",
        rowDepartment: "office",
        passedAt: new Date("2026-10-01T00:00:00Z"),
      },
    ]);

    expect(result.get(5)).toBe("office");
  });

  it("keeps the department of the latest pass when several flows were passed", () => {
    const result = resolveLatestPassedDepartments([
      {
        uid: 5,
        flowDepartment: "software",
        rowDepartment: null,
        passedAt: new Date("2026-10-01T00:00:00Z"),
      },
      {
        uid: 5,
        flowDepartment: "office",
        rowDepartment: null,
        passedAt: new Date("2026-10-08T00:00:00Z"),
      },
    ]);

    expect(result.get(5)).toBe("office");
  });

  it("prefers the flow department and falls back to the row department", () => {
    const result = resolveLatestPassedDepartments([
      {
        uid: 5,
        /* 流程归属为空（历史/全局流程）：回落报名记录固化的部门 */
        flowDepartment: null,
        rowDepartment: "publicity",
        passedAt: "2026-10-02T00:00:00Z",
      },
    ]);

    expect(result.get(5)).toBe("publicity");
  });

  it("keeps the later row when pass timestamps are equal", () => {
    const result = resolveLatestPassedDepartments([
      {
        uid: 5,
        flowDepartment: "software",
        rowDepartment: null,
        passedAt: "2026-10-02T00:00:00Z",
      },
      {
        uid: 5,
        flowDepartment: "liaison",
        rowDepartment: null,
        passedAt: "2026-10-02T00:00:00Z",
      },
    ]);

    expect(result.get(5)).toBe("liaison");
  });

  it("ignores rows without a usable department and handles missing timestamps", () => {
    const result = resolveLatestPassedDepartments([
      { uid: 5, flowDepartment: null, rowDepartment: "   ", passedAt: null },
      { uid: 6, flowDepartment: "office", rowDepartment: null, passedAt: null },
    ]);

    expect(result.has(5)).toBe(false);
    expect(result.get(6)).toBe("office");
  });

  it("prefers the first volunteer department when an office candidate passed several departments", () => {
    const result = resolveLatestPassedDepartments([
      {
        uid: 5,
        flowType: "office_interview",
        choice: 1,
        flowDepartment: "office",
        rowDepartment: "office",
        passedAt: new Date("2026-10-01T00:00:00Z"),
      },
      {
        uid: 5,
        flowType: "office_interview",
        choice: 2,
        flowDepartment: "publicity",
        rowDepartment: "publicity",
        passedAt: new Date("2026-10-09T00:00:00Z"),
      },
    ]);

    expect(result.get(5)).toBe("office");
  });

  it("keeps the only passed office department when the first volunteer failed", () => {
    const result = resolveLatestPassedDepartments([
      {
        uid: 5,
        flowType: "office_interview",
        choice: 2,
        flowDepartment: "liaison",
        rowDepartment: "liaison",
        passedAt: new Date("2026-10-05T00:00:00Z"),
      },
    ]);

    expect(result.get(5)).toBe("liaison");
  });

  it("uses the committee's final destination over the first volunteer preference", () => {
    const result = resolveLatestPassedDepartments([
      {
        uid: 5,
        flowType: "office_interview",
        choice: 1,
        finalDepartment: "publicity",
        flowDepartment: "office",
        rowDepartment: "office",
        passedAt: new Date("2026-10-01T00:00:00Z"),
      },
      {
        uid: 5,
        flowType: "office_interview",
        choice: 2,
        finalDepartment: "publicity",
        flowDepartment: "publicity",
        rowDepartment: "publicity",
        passedAt: new Date("2026-10-02T00:00:00Z"),
      },
    ]);

    expect(result.get(5)).toBe("publicity");
  });
});
