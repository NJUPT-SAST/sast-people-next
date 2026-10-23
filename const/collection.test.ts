/** @jest-environment node */

import {
  COLLECTION_DEFAULT_STUDY_YEARS,
  deriveEnrollmentYearFromStudentId,
  deriveGraduationYear,
  deriveGraduationYearFromClassName,
} from "./collection";

describe("deriveEnrollmentYearFromStudentId", () => {
  it("reads the two-digit year after the letter prefix", () => {
    expect(deriveEnrollmentYearFromStudentId("B24010101")).toBe(2024);
    expect(deriveEnrollmentYearFromStudentId("b26010101")).toBe(2026);
  });

  it("accepts an explicit four-digit year when there is no letter prefix", () => {
    expect(deriveEnrollmentYearFromStudentId("20240101")).toBe(2024);
    expect(deriveEnrollmentYearFromStudentId("19990101")).toBe(1999);
  });

  it("returns null for values without an inferable year", () => {
    expect(deriveEnrollmentYearFromStudentId("")).toBeNull();
    expect(deriveEnrollmentYearFromStudentId("B2401")).toBeNull();
    expect(deriveEnrollmentYearFromStudentId("240101")).toBeNull();
  });
});

describe("deriveGraduationYear", () => {
  it("defaults to a four-year programme", () => {
    expect(COLLECTION_DEFAULT_STUDY_YEARS).toBe(4);
    expect(deriveGraduationYear(2024)).toBe(2028);
    expect(deriveGraduationYear(2024, 3)).toBe(2027);
  });

  it("uses the class prefix year when a class code is available", () => {
    expect(deriveGraduationYearFromClassName("B250607")).toBe(2029);
    expect(deriveGraduationYearFromClassName("b250607")).toBe(2029);
    expect(deriveGraduationYearFromClassName("")).toBeNull();
    expect(deriveGraduationYearFromClassName("B2506")).toBeNull();
  });
});
