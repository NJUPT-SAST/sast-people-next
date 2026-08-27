import { getFeishuCalendarSubscriptionCacheKey } from "./interviewSchedule-utils";

describe("getFeishuCalendarSubscriptionCacheKey", () => {
  it("keeps different calendars for the same user separate", () => {
    expect(
      getFeishuCalendarSubscriptionCacheKey(7, "shared-calendar"),
    ).not.toBe(getFeishuCalendarSubscriptionCacheKey(7, "primary"));
  });
});
