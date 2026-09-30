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
        /* 共享办公类流程归属为空：用报名记录固化的第一志愿部门 */
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
});
