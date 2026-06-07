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
] as const;

const originalEnv = Object.fromEntries(
  ["NODE_ENV", ...envKeys].map((key) => [key, process.env[key]]),
) as Record<(typeof envKeys)[number] | "NODE_ENV", string | undefined>;

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
    process.env.NODE_ENV = "test";
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
    });
  });

  it("redirects non-production email to the configured test recipient", () => {
    process.env.EMAIL_TEST_RECIPIENT = "safe@example.com";

    expect(resolveEmailEnvelope("candidate@njupt.edu.cn", "结果通知")).toEqual({
      to: "safe@example.com",
      subject: "[TEST to candidate@njupt.edu.cn] 结果通知",
    });
  });

  it("keeps the real recipient in production", () => {
    process.env.NODE_ENV = "production";

    expect(resolveEmailEnvelope("candidate@njupt.edu.cn", "结果通知")).toEqual({
      to: "candidate@njupt.edu.cn",
      subject: "结果通知",
    });
  });
});
