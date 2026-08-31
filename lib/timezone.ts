export const BUSINESS_TIME_ZONE = "Asia/Shanghai";

const dateTimePartNames = [
  "year",
  "month",
  "day",
  "hour",
  "minute",
  "second",
] as const;

type BeijingDateParts = Record<(typeof dateTimePartNames)[number], number>;

const dateTimeFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: BUSINESS_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function getBeijingDateParts(value: Date): BeijingDateParts {
  const parts = Object.fromEntries(
    dateTimeFormatter.formatToParts(value).map(({ type, value: partValue }) => [
      type,
      Number(partValue),
    ]),
  ) as Partial<BeijingDateParts>;

  return {
    year: parts.year!,
    month: parts.month!,
    day: parts.day!,
    hour: parts.hour!,
    minute: parts.minute!,
    second: parts.second!,
  };
}

export function formatBeijingDateTime(value: Date | string | number) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  const parts = dateTimeFormatter.formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value: partValue }) => [type, partValue]));
  return `${values.year}-${values.month}-${values.day} ${values.hour}:${values.minute}:${values.second}`;
}

export function formatBeijingDate(value: Date | string | number) {
  const formatted = formatBeijingDateTime(value);
  return formatted === "-" ? formatted : formatted.slice(0, 10);
}

/** Convert valid Beijing wall-clock fields into an absolute instant. */
export function fromBeijingDateParts(
  parts: Pick<BeijingDateParts, "year" | "month" | "day"> &
    Partial<Pick<BeijingDateParts, "hour" | "minute" | "second">>,
) {
  const hour = parts.hour ?? 0;
  const minute = parts.minute ?? 0;
  const second = parts.second ?? 0;
  const maxDay = new Date(Date.UTC(parts.year, parts.month, 0)).getUTCDate();
  if (
    parts.month < 1 || parts.month > 12 ||
    parts.day < 1 || parts.day > maxDay ||
    hour < 0 || hour > 23 || minute < 0 || minute > 59 ||
    second < 0 || second > 59
  ) {
    return new Date(Number.NaN);
  }
  return new Date(
    `${String(parts.year).padStart(4, "0")}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:${String(second).padStart(2, "0")}+08:00`,
  );
}

/** Project an absolute instant onto a local Date whose fields are Beijing fields. */
export function toBeijingWallClockDate(value: Date) {
  const parts = getBeijingDateParts(value);
  return new Date(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
    value.getMilliseconds(),
  );
}

export function parseBeijingDateOnly(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const date = fromBeijingDateParts({
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  });
  return Number.isNaN(date.getTime()) ? null : date;
}

export function getBeijingDayRange(now = new Date()) {
  const parts = getBeijingDateParts(now);
  const start = fromBeijingDateParts({
    year: parts.year,
    month: parts.month,
    day: parts.day,
  });
  return {
    start,
    end: new Date(start.getTime() + 24 * 60 * 60 * 1000),
  };
}

export type { BeijingDateParts };
export function parseBeijingDateTime(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value.trim());
  if (!match) return null;
  const date = fromBeijingDateParts({
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4]),
    minute: Number(match[5]),
    second: Number(match[6] ?? 0),
  });
  return Number.isNaN(date.getTime()) ? null : date;
}
