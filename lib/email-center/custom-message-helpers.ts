/**
 * 自定义邮件的纯函数辅助：收件人去重、手填邮箱校验、正文有效性判断。
 * 不依赖数据库 / `server-only`，服务端 action 与测试共用。
 */

import { sanitizeEmailHtml } from "@/lib/email/sanitize";
import { parseBeijingDateTime } from "@/lib/timezone";
import type { CustomEmailRecipient } from "./custom-message-types";

export const CUSTOM_EMAIL_MAX_RECIPIENTS = 500;
export const CUSTOM_EMAIL_MAX_MANUAL_ADDRESSES = 100;
export const CUSTOM_EMAIL_MAX_SUBJECT_LENGTH = 255;
export const CUSTOM_EMAIL_MAX_BODY_LENGTH = 200_000;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function sanitizeSubject(value: string) {
  return value
    .replace(/[\r\n]+/g, " ")
    .trim()
    .slice(0, CUSTOM_EMAIL_MAX_SUBJECT_LENGTH);
}

export function normalizeCustomEmailSubject(value: string) {
  return sanitizeSubject(value);
}

export function normalizeManualAddresses(values: string[]) {
  const seen = new Set<string>();
  const addresses: string[] = [];

  for (const value of values) {
    const address = value.trim();
    if (
      !address ||
      address.length > 254 ||
      !EMAIL_PATTERN.test(address)
    ) {
      continue;
    }
    const key = address.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    addresses.push(address);
    if (addresses.length >= CUSTOM_EMAIL_MAX_MANUAL_ADDRESSES) break;
  }

  return addresses;
}

export function parseCustomEmailSchedule(
  value: string | null | undefined,
  now = new Date(),
) {
  if (!value) {
    throw new Error("请选择定时发送时间");
  }
  const date = parseBeijingDateTime(value);
  if (!date) {
    throw new Error("定时发送时间格式不正确");
  }
  if (date.getTime() <= now.getTime() + 30_000) {
    throw new Error("定时发送时间必须晚于当前时间");
  }
  return date;
}

export function normalizeRecipientUserIds(values: number[]) {
  return Array.from(
    new Set(
      values
        .map((value) => Number(value))
        .filter((value) => Number.isSafeInteger(value) && value > 0),
    ),
  ).slice(0, CUSTOM_EMAIL_MAX_RECIPIENTS);
}

export function hasMeaningfulEmailBody(html: string) {
  const sanitized = sanitizeEmailHtml(html);
  const text = sanitized
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > 0 || /<img\b/i.test(sanitized);
}

export function buildCustomEmailRecipients({
  users,
  manualAddresses,
}: {
  users: Array<{
    id: number;
    name: string;
    studentId: string | null;
    email: string | null;
    department: string | null;
  }>;
  manualAddresses: string[];
}) {
  const recipients: CustomEmailRecipient[] = [];
  const seen = new Set<string>();
  const missingEmailUserIds: number[] = [];

  for (const user of users) {
    const address = user.email?.trim() ?? "";
    if (
      !address ||
      address.length > 254 ||
      !EMAIL_PATTERN.test(address)
    ) {
      missingEmailUserIds.push(user.id);
      continue;
    }
    const key = address.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    recipients.push({
      userId: user.id,
      address,
      name: user.name,
      studentId: user.studentId,
      department: user.department,
    });
  }

  for (const address of normalizeManualAddresses(manualAddresses)) {
    const key = address.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    recipients.push({
      userId: null,
      address,
      name: null,
      studentId: null,
      department: null,
    });
  }

  return { recipients, missingEmailUserIds };
}