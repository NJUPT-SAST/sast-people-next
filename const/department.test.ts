import {
  DEPARTMENT_CATEGORIES,
  DEPARTMENT_KEYS,
  ENABLED_DEPARTMENT_KEYS,
  OFFICE_DEPARTMENT_KEYS,
  departmentCategory,
  mergeDepartmentKeys,
} from "./department";

describe("departmentCategory", () => {
  it("classifies tech and office departments", () => {
    expect(departmentCategory("software")).toBe("tech");
    expect(departmentCategory("media")).toBe("tech");
    expect(departmentCategory("electronics")).toBe("tech");
    expect(departmentCategory("office")).toBe("office");
    expect(departmentCategory("publicity")).toBe("office");
    expect(departmentCategory("liaison")).toBe("office");
    expect(departmentCategory("competition")).toBe("office");
  });

  it("treats unknown and blank values conservatively", () => {
    expect(departmentCategory("brand_new_department")).toBe("unknown");
    expect(departmentCategory(null)).toBe("unknown");
    expect(departmentCategory("   ")).toBe("unknown");
  });

  it("keeps the office list in sync with the category map", () => {
    for (const key of OFFICE_DEPARTMENT_KEYS) {
      expect(DEPARTMENT_CATEGORIES[key]).toBe("office");
    }
  });
});

describe("mergeDepartmentKeys", () => {
  it("lists the whole catalogue even when nothing is stored yet", () => {
    expect(mergeDepartmentKeys(DEPARTMENT_KEYS, [])).toEqual(
      [...DEPARTMENT_KEYS].sort((a, b) => a.localeCompare(b, "zh-CN")),
    );
  });

  it("keeps stored keys outside the catalogue and drops blank values", () => {
    const keys = mergeDepartmentKeys(DEPARTMENT_KEYS, [
      "custom_dept",
      null,
      "   ",
      "software",
    ]);

    expect(keys).toContain("custom_dept");
    expect(keys).not.toContain("");
    expect(new Set(keys).size).toBe(keys.length);
    expect([...keys]).toEqual([...keys].sort((a, b) => a.localeCompare(b, "zh-CN")));
  });

  it("keeps disabled departments out of the enabled catalogue only", () => {
    expect(DEPARTMENT_KEYS).toContain("electronics");
    expect(ENABLED_DEPARTMENT_KEYS).not.toContain("electronics");
  });
});
