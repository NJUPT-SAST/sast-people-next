import { escapeCsv, escapeCsvMonth } from "./csv";

describe("escapeCsv", () => {
  it("wraps commas, quotes and newlines", () => {
    expect(escapeCsv("a,b")).toBe('"a,b"');
    expect(escapeCsv('say "hi"')).toBe('"say ""hi"""');
    expect(escapeCsv("a\nb")).toBe('"a\nb"');
  });

  it("neutralises formula prefixes", () => {
    expect(escapeCsv("=1+1")).toBe("'=1+1");
    expect(escapeCsv("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(escapeCsv("-1")).toBe("'-1");
  });
});

describe("escapeCsvMonth", () => {
  it("forces Excel to keep a YYYY-MM value as text", () => {
    expect(escapeCsvMonth("2007-05")).toBe('"=""2007-05"""');
  });

  it("falls back to normal escaping for non-month values", () => {
    expect(escapeCsvMonth("2020-13")).toBe("2020-13");
    expect(escapeCsvMonth("2007-5")).toBe("2007-5");
    expect(escapeCsvMonth("=1+1")).toBe("'=1+1");
    expect(escapeCsvMonth("")).toBe("");
  });
});
