import "server-only";

const DEFAULT_SMTP_HOST = "smtp.feishu.cn";
const DEFAULT_SMTP_PORT = 465;
const DEFAULT_SMTP_USER = "recruitment@sast.fun";
const DEFAULT_EMAIL_FROM = '"SAST People" <recruitment@sast.fun>';
const DEFAULT_TEST_EMAIL_RECIPIENT = "b24150524@njupt.edu.cn";
const DEFAULT_RETRY_MAX_ATTEMPTS = 5;
const DEFAULT_RETRY_BASE_DELAY_SECONDS = 60;
const DEFAULT_RETRY_MAX_DELAY_SECONDS = 3600;
const DEFAULT_RETRY_SCAN_LIMIT = 50;
const DEFAULT_SEND_RATE_LIMIT_PER_MINUTE = 120;
const DEFAULT_ATTEMPT_RETENTION_DAYS = 180;

export type SmtpEmailConfig = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string | null;
  from: string;
  testRecipient: string;
  configured: boolean;
};

export type EmailCenterConfigSummary = {
  smtpConfigured: boolean;
  smtpHost: string;
  sender: string;
  testRecipient: string;
  queueStatus: string;
  realRecipientMode: boolean;
  retryMaxAttempts: number;
  retryBaseDelaySeconds: number;
  retryMaxDelaySeconds: number;
  retryScanLimit: number;
  sendRateLimitPerMinute: number;
  attemptRetentionDays: number;
  webhookConfigured: boolean;
  readinessChecks: EmailCenterReadinessCheck[];
};

export type EmailCenterReadinessCheck = {
  key: string;
  label: string;
  status: "pass" | "warn" | "fail";
  detail: string;
};

function getEnvString(name: string, fallback: string) {
  const value = process.env[name]?.trim();
  return value || fallback;
}

function getEnvNumber(name: string, fallback: number) {
  const parsed = Number(process.env[name]);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function getOptionalEnvString(name: string) {
  return process.env[name]?.trim() || null;
}

function getEnvBoolean(name: string, fallback: boolean) {
  const value = process.env[name]?.trim().toLowerCase();
  if (!value) return fallback;
  if (["1", "true", "yes", "on"].includes(value)) return true;
  if (["0", "false", "no", "off"].includes(value)) return false;
  return fallback;
}

export function isRealEmailRecipientMode() {
  return process.env.NODE_ENV === "production";
}

export function getSmtpEmailConfig(): SmtpEmailConfig {
  const user = getEnvString("EMAIL_SMTP_USER", DEFAULT_SMTP_USER);
  const password = process.env.EMAIL_PASSWORD?.trim() || null;

  return {
    host: getEnvString("EMAIL_SMTP_HOST", DEFAULT_SMTP_HOST),
    port: getEnvNumber("EMAIL_SMTP_PORT", DEFAULT_SMTP_PORT),
    secure: getEnvBoolean("EMAIL_SMTP_SECURE", true),
    user,
    password,
    from: getEnvString("EMAIL_FROM", DEFAULT_EMAIL_FROM),
    testRecipient: getEnvString(
      "EMAIL_TEST_RECIPIENT",
      DEFAULT_TEST_EMAIL_RECIPIENT,
    ),
    configured: Boolean(user && password),
  };
}

export function getEmailRetryPolicy() {
  const maxAttempts = getEnvNumber(
    "EMAIL_RETRY_MAX_ATTEMPTS",
    DEFAULT_RETRY_MAX_ATTEMPTS,
  );
  const baseDelaySeconds = getEnvNumber(
    "EMAIL_RETRY_BASE_DELAY_SECONDS",
    DEFAULT_RETRY_BASE_DELAY_SECONDS,
  );
  const maxDelaySeconds = getEnvNumber(
    "EMAIL_RETRY_MAX_DELAY_SECONDS",
    DEFAULT_RETRY_MAX_DELAY_SECONDS,
  );
  const scanLimit = getEnvNumber(
    "EMAIL_RETRY_SCAN_LIMIT",
    DEFAULT_RETRY_SCAN_LIMIT,
  );

  return {
    maxAttempts,
    baseDelaySeconds,
    maxDelaySeconds: Math.max(baseDelaySeconds, maxDelaySeconds),
    scanLimit,
  };
}

export function getEmailSendRateLimitPerMinute() {
  return getEnvNumber(
    "EMAIL_SEND_RATE_LIMIT_PER_MINUTE",
    DEFAULT_SEND_RATE_LIMIT_PER_MINUTE,
  );
}

export function getEmailAttemptRetentionDays() {
  return getEnvNumber(
    "EMAIL_ATTEMPT_RETENTION_DAYS",
    DEFAULT_ATTEMPT_RETENTION_DAYS,
  );
}

export function getEmailWebhookSecret() {
  return getOptionalEnvString("EMAIL_WEBHOOK_SECRET");
}

export function resolveEmailEnvelope(to: string, subject: string) {
  if (isRealEmailRecipientMode()) {
    return { to, subject };
  }

  const config = getSmtpEmailConfig();
  return {
    to: config.testRecipient,
    subject: `[TEST to ${to}] ${subject}`,
  };
}

export function getEmailCenterConfigSummary(): EmailCenterConfigSummary {
  const config = getSmtpEmailConfig();
  const retryPolicy = getEmailRetryPolicy();
  const sendRateLimitPerMinute = getEmailSendRateLimitPerMinute();
  const attemptRetentionDays = getEmailAttemptRetentionDays();
  const webhookConfigured = Boolean(getEmailWebhookSecret());
  const smtpHost = `${config.host}:${config.port}${
    config.secure ? " / TLS" : " / 非 TLS"
  }`;
  const readinessChecks = getEmailCenterReadinessChecks({
    smtpConfigured: config.configured,
    realRecipientMode: isRealEmailRecipientMode(),
    webhookConfigured,
    sendRateLimitPerMinute,
    attemptRetentionDays,
  });

  return {
    smtpConfigured: config.configured,
    smtpHost,
    sender: config.from,
    testRecipient: config.testRecipient,
    queueStatus: config.configured
      ? process.env.NODE_ENV === "production"
        ? "Inngest 邮件队列（生产）"
        : "Inngest dev / 直发 fallback（开发）"
      : "不可发送：EMAIL_PASSWORD 未配置",
    realRecipientMode: isRealEmailRecipientMode(),
    retryMaxAttempts: retryPolicy.maxAttempts,
    retryBaseDelaySeconds: retryPolicy.baseDelaySeconds,
    retryMaxDelaySeconds: retryPolicy.maxDelaySeconds,
    retryScanLimit: retryPolicy.scanLimit,
    sendRateLimitPerMinute,
    attemptRetentionDays,
    webhookConfigured,
    readinessChecks,
  };
}

function getEmailCenterReadinessChecks({
  smtpConfigured,
  realRecipientMode,
  webhookConfigured,
  sendRateLimitPerMinute,
  attemptRetentionDays,
}: {
  smtpConfigured: boolean;
  realRecipientMode: boolean;
  webhookConfigured: boolean;
  sendRateLimitPerMinute: number;
  attemptRetentionDays: number;
}): EmailCenterReadinessCheck[] {
  return [
    {
      key: "smtp",
      label: "SMTP 凭据",
      status: smtpConfigured ? "pass" : "fail",
      detail: smtpConfigured
        ? "EMAIL_PASSWORD 已配置，可连接邮件发送服务。"
        : "EMAIL_PASSWORD 未配置，发送动作会失败并落库失败原因。",
    },
    {
      key: "recipient-mode",
      label: "收件人模式",
      status: realRecipientMode ? "pass" : "warn",
      detail: realRecipientMode
        ? "当前环境会发送到真实收件人。"
        : "当前环境会重定向到 EMAIL_TEST_RECIPIENT，适合本地/预发验证。",
    },
    {
      key: "webhook",
      label: "投递回执",
      status: webhookConfigured ? "pass" : "warn",
      detail: webhookConfigured
        ? "EMAIL_WEBHOOK_SECRET 已配置，可接收 provider 回执。"
        : "未配置 EMAIL_WEBHOOK_SECRET，回执入口会拒绝外部事件。",
    },
    {
      key: "rate-limit",
      label: "全局限速",
      status: sendRateLimitPerMinute > 0 ? "pass" : "fail",
      detail: `每分钟最多发送 ${sendRateLimitPerMinute} 封，跨实例共享数据库 bucket。`,
    },
    {
      key: "retention",
      label: "尝试日志保留",
      status: attemptRetentionDays >= 30 ? "pass" : "warn",
      detail: `email_delivery_attempt 保留 ${attemptRetentionDays} 天后由维护任务清理。`,
    },
  ];
}
