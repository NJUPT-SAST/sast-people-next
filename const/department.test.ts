import {
  DEPARTMENT_CATEGORIES,
  OFFICE_DEPARTMENT_KEYS,
  departmentCategory,
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
