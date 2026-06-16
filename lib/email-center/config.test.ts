jest.mock("server-only", () => ({}));

import {
  getEmailCenterConfigSummary,
  getSmtpEmailConfig,
  resolveEmailEnvelope,
} from "@/lib/email-center/config";

const envKeys = [
  "EMAIL_SMTP_HOST",
  "EMAIL_SMTP_PORT",
  "EMAIL_SMTP_SECURE",
  "EMAIL_SMTP_USER",
  "EMAIL_FROM",
  "EMAIL_PASSWORD",
  "EMAIL_TEST_RECIPIENT",
  "EMAIL_RETRY_MAX_ATTEMPTS",
  "EMAIL_RETRY_BASE_DELAY_SECONDS",
  "EMAIL_RETRY_MAX_DELAY_SECONDS",
  "EMAIL_RETRY_SCAN_LIMIT",
  "EMAIL_SEND_RATE_LIMIT_PER_MINUTE",
  "EMAIL_ATTEMPT_RETENTION_DAYS",
  "EMAIL_WEBHOOK_SECRET",
] as const;

const originalEnv = Object.fromEntries(
  ["NODE_ENV", ...envKeys].map((key) => [key, process.env[key]]),
) as Record<(typeof envKeys)[number] | "NODE_ENV", string | undefined>;

function setNodeEnv(value: string) {
  Object.assign(process.env, { NODE_ENV: value });
}

function restoreOriginalEnv() {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

describe("email center config", () => {
  beforeEach(() => {
    for (const key of envKeys) {
      delete process.env[key];
    }
    setNodeEnv("test");
  });

  afterAll(() => {
    restoreOriginalEnv();
  });

  it("uses Feishu SMTP defaults without marking email configured", () => {
    expect(getSmtpEmailConfig()).toMatchObject({
      host: "smtp.feishu.cn",
      port: 465,
      secure: true,
      user: "recruitment@sast.fun",
      password: null,
      from: '"SAST People" <recruitment@sast.fun>',
      testRecipient: "b24150524@njupt.edu.cn",
      configured: false,
    });
  });

  it("allows SMTP settings to be overridden by env vars", () => {
    process.env.EMAIL_SMTP_HOST = "smtp.example.com";
    process.env.EMAIL_SMTP_PORT = "587";
    process.env.EMAIL_SMTP_SECURE = "false";
    process.env.EMAIL_SMTP_USER = "mailer@example.com";
    process.env.EMAIL_FROM = '"People Ops" <mailer@example.com>';
    process.env.EMAIL_PASSWORD = "secret";
    process.env.EMAIL_TEST_RECIPIENT = "safe@example.com";

    expect(getSmtpEmailConfig()).toMatchObject({
      host: "smtp.example.com",
      port: 587,
      secure: false,
      user: "mailer@example.com",
      password: "secret",
      from: '"People Ops" <mailer@example.com>',
      testRecipient: "safe@example.com",
      configured: true,
    });
    expect(getEmailCenterConfigSummary()).toMatchObject({
      smtpConfigured: true,
      smtpHost: "smtp.example.com:587 / 非 TLS",
      sender: '"People Ops" <mailer@example.com>',
      testRecipient: "safe@example.com",
      realRecipientMode: false,
      retryMaxAttempts: 5,
      sendRateLimitPerMinute: 120,
      attemptRetentionDays: 180,
      webhookConfigured: false,
    });
  });

  it("summarizes production hardening settings", () => {
    process.env.EMAIL_PASSWORD = "secret";
    process.env.EMAIL_RETRY_MAX_ATTEMPTS = "7";
    process.env.EMAIL_RETRY_BASE_DELAY_SECONDS = "30";
    process.env.EMAIL_RETRY_MAX_DELAY_SECONDS = "900";
    process.env.EMAIL_RETRY_SCAN_LIMIT = "25";
    process.env.EMAIL_SEND_RATE_LIMIT_PER_MINUTE = "80";
    process.env.EMAIL_ATTEMPT_RETENTION_DAYS = "365";
    process.env.EMAIL_WEBHOOK_SECRET = "webhook-secret";

    expect(getEmailCenterConfigSummary()).toMatchObject({
      retryMaxAttempts: 7,
      retryBaseDelaySeconds: 30,
      retryMaxDelaySeconds: 900,
      retryScanLimit: 25,
      sendRateLimitPerMinute: 80,
      attemptRetentionDays: 365,
      webhookConfigured: true,
    });
    expect(getEmailCenterConfigSummary().readinessChecks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "smtp", status: "pass" }),
        expect.objectContaining({ key: "webhook", status: "pass" }),
      ]),
    );
  });

  it("redirects non-production email to the configured test recipient", () => {
    process.env.EMAIL_TEST_RECIPIENT = "safe@example.com";

    expect(resolveEmailEnvelope("candidate@njupt.edu.cn", "结果通知")).toEqual({
      to: "safe@example.com",
      subject: "[TEST to candidate@njupt.edu.cn] 结果通知",
    });
  });

  it("keeps the real recipient in production", () => {
    setNodeEnv("production");

    expect(resolveEmailEnvelope("candidate@njupt.edu.cn", "结果通知")).toEqual({
      to: "candidate@njupt.edu.cn",
      subject: "结果通知",
    });
  });
});
