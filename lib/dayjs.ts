import { default as originalDayjs, type ConfigType } from "dayjs";
import advancedFormat from "dayjs/plugin/advancedFormat";
import calendar from "dayjs/plugin/calendar";
import customParseFormat from "dayjs/plugin/customParseFormat";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";
import "dayjs/locale/zh-cn";

import { BUSINESS_TIME_ZONE } from "@/lib/timezone";

originalDayjs.extend(advancedFormat);
originalDayjs.extend(calendar);
originalDayjs.extend(customParseFormat);
originalDayjs.extend(utc);
originalDayjs.extend(timezone);
originalDayjs.locale("zh-cn");

const dayjs = (date?: ConfigType) =>
  originalDayjs(date).tz(BUSINESS_TIME_ZONE);

export default dayjs;
