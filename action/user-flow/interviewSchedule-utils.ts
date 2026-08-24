export function getFeishuCalendarSubscriptionCacheKey(userId: number, calendarId: string) {
  return `${userId}:${calendarId}`;
}
