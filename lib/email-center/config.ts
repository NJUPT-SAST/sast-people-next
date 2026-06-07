import "server-only";

const DEFAULT_SMTP_HOST = "smtp.feishu.cn";
const DEFAULT_SMTP_PORT = 465;
const DEFAULT_SMTP_USER = "recruitment@sast.fun";
const DEFAULT_EMAIL_FROM = '"SAST People" <recruitment@sast.fun>';
const DEFAULT_TEST_EMAIL_RECIPIENT = "b24150524@njupt.edu.cn";

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
};

function getEnvString(name: string, fallback: string) {
  const value = process.env[name]?.trim();
  return value || fallback;
}

function getEnvNumber(name: string, fallback: number) {
  const parsed = Number(process.env[name]);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
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
  const smtpHost = `${config.host}:${config.port}${
    config.secure ? " / TLS" : " / 非 TLS"
  }`;

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
  };
}
