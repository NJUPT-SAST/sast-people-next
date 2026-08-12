import {
  readNonNegativeIntegerEnv,
  readPositiveIntegerEnv,
} from "./pool-config";

describe("database pool environment settings", () => {
  const name = "DATABASE_POOL_TEST_VALUE";
  const originalValue = process.env[name];

  afterEach(() => {
    if (originalValue === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = originalValue;
    }
  });

  it("accepts only positive integers for the pool size", () => {
    process.env[name] = "24";
    expect(readPositiveIntegerEnv(name, 20)).toBe(24);

    for (const value of ["0", "-1", "2.5", "", " 4", "four"]) {
      process.env[name] = value;
      expect(readPositiveIntegerEnv(name, 20)).toBe(20);
    }
  });

  it("allows zero only for timeout settings", () => {
    for (const [value, expected] of [["0", 0], ["1500", 1500]] as const) {
      process.env[name] = value;
      expect(readNonNegativeIntegerEnv(name, 30000)).toBe(expected);
    }

    for (const value of ["-1", "1.5", "", " 0", "none"]) {
      process.env[name] = value;
      expect(readNonNegativeIntegerEnv(name, 30000)).toBe(30000);
    }
  });
});
