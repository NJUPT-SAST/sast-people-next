export const batchStatusText: Record<string, string> = {
  draft: "待发送",
  queued: "发送中",
  completed: "已完成",
  failed: "有失败",
};

export const deliveryStatusText: Record<string, string> = {
  pending: "待发送",
  sending: "发送中",
  sent: "已发送",
  failed: "失败",
  dead: "死信",
};

export const emailCategoryText: Record<string, string> = {
  result: "结果通知",
  interview: "面试通知",
  test: "测试邮件",
};

export const hiddenScrollbar = "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden";
export const EMAIL_REFRESH_INTERVAL_MS = 3000;
export const EMAIL_REFRESH_MAX_ATTEMPTS = 20;

export const emailCenterTabs = [
  { value: "overview", label: "概览" },
  { value: "tasks", label: "发送任务" },
  { value: "records", label: "发送记录" },
  { value: "templates", label: "模板管理" },
  { value: "config", label: "配置" },
] as const;

export type EmailCenterTab = (typeof emailCenterTabs)[number]["value"];

export function normalizeEmailCenterTab(value: string | undefined): EmailCenterTab {
  return emailCenterTabs.some((tab) => tab.value === value)
    ? (value as EmailCenterTab)
    : "overview";
}

export function isToday(value: Date | string | null) {
  if (!value) return false;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  const now = new Date();
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
}

export function getBatchStatusBadgeClass(status: string) {
  if (status === "completed") {
    return "border-primary/25 bg-primary/10 text-primary";
  }
  if (status === "failed" || status === "dead") {
    return "border-destructive/25 bg-destructive/10 text-destructive";
  }
  if (status === "queued") {
    return "border-chart-3/30 bg-chart-3/15 text-chart-3";
  }
  return "border-border bg-muted/40 text-muted-foreground";
}

export function getDeliveryStatusBadgeClass(status: string) {
  if (status === "sent") {
    return "border-primary/25 bg-primary/10 text-primary";
  }
  if (status === "failed" || status === "dead") {
    return "border-destructive/25 bg-destructive/10 text-destructive";
  }
  if (status === "sending") {
    return "border-chart-3/30 bg-chart-3/15 text-chart-3";
  }
  return "border-border bg-muted/40 text-muted-foreground";
}

export function formatDate(value: Date | string | null) {
  if (!value) return "-";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function getSettingLabel(templateKey: string) {
  return templateKey.endsWith("accepted") ? "通过模板" : "不通过模板";
}
