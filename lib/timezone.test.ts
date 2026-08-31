import {
  formatBeijingDateTime,
  fromBeijingDateParts,
  getBeijingDayRange,
  parseBeijingDateOnly,
  parseBeijingDateTime,
} from "./timezone";

describe("Beijing business time", () => {
  it("formats absolute instants in Beijing time", () => {
    expect(formatBeijingDateTime("2026-08-31T15:59:59.000Z")).toBe(
      "2026-08-31 23:59:59",
    );
  });

  it("parses wall-clock input as Beijing time regardless of runtime timezone", () => {
    expect(parseBeijingDateTime("2026-09-01T08:00")?.toISOString()).toBe(
      "2026-09-01T00:00:00.000Z",
    );
  });

  it("rejects invalid calendar values instead of rolling them over", () => {
    expect(parseBeijingDateOnly("2026-02-30")).toBeNull();
    const invalidDate = fromBeijingDateParts({
      year: 2026,
      month: 1,
      day: 1,
      hour: 24,
    });
    expect(Number.isNaN(invalidDate.getTime())).toBe(true);

  });
  it("builds the Beijing calendar-day range", () => {
    const range = getBeijingDayRange(new Date("2026-08-31T15:59:59.000Z"));
    expect(range.start.toISOString()).toBe("2026-08-30T16:00:00.000Z");
    expect(range.end.toISOString()).toBe("2026-08-31T15:59:59.999Z");
  });
});
