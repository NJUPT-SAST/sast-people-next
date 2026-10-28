/**
 * 自定义邮件（写信）的共享类型。
 *
 * 这里不能 import `server-only` / Drizzle 运行时，客户端写信界面与服务端 action
 * 都直接引用这些类型，避免把数据库模块带进浏览器包。
 */

export type CustomEmailStatus =
  | "draft"
  | "scheduled"
  | "sending"
  | "sent"
  | "failed"
  | "canceled";

export const CUSTOM_EMAIL_STATUS_TEXT: Record<CustomEmailStatus, string> = {
  draft: "草稿",
  scheduled: "定时发送",
  sending: "发送中",
  sent: "已发送",
  failed: "有失败",
  canceled: "已取消",
};

export type CustomEmailMessageRecord = {
  id: number;
  status: CustomEmailStatus;
  subject: string;
  htmlBody: string;
  recipientUserIds: number[];
  manualAddresses: string[];
  recipientCount: number;
  scheduledAt: Date | null;
  sentAt: Date | null;
  createdBy: number;
  updatedBy: number | null;
  department: string | null;
  lastError: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
};

export type CustomEmailRecipient = {
  userId: number | null;
  address: string;
  name: string | null;
  studentId: string | null;
  department: string | null;
};

export type CustomEmailMessageSummary = {
  id: number;
  status: CustomEmailStatus;
  subject: string;
  recipientCount: number;
  scheduledAt: Date | null;
  sentAt: Date | null;
  updatedAt: Date;
  lastError: string | null;
};

export type CustomEmailWorkspace = {
  drafts: CustomEmailMessageSummary[];
  scheduled: CustomEmailMessageSummary[];
  recent: CustomEmailMessageSummary[];
};

export type CustomEmailMessageDetail = {
  message: CustomEmailMessageRecord;
  recipients: CustomEmailRecipient[];
};

export type CustomEmailRecipientSearchUser = {
  id: number;
  name: string;
  studentId: string | null;
  email: string | null;
  department: string | null;
  role: string;
};

export type CustomEmailRecipientSearchResult = {
  users: CustomEmailRecipientSearchUser[];
  total: number;
  page: number;
  pageSize: number;
};

export type RenderedCustomEmail = {
  subject: string;
  html: string;
};