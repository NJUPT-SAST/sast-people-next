import "server-only";

import {
  getSmtpEmailConfig,
  resolveEmailEnvelope,
} from "@/lib/email-center/config";
import { createTransport } from "nodemailer";

export type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
};

function getConfiguredSmtpEmailConfig() {
  const config = getSmtpEmailConfig();
  const password = config.password;
  if (!config.configured || !password) {
    throw new Error("邮件密码未配置，请先设置 EMAIL_PASSWORD。");
  }
  return { ...config, password };
}

export const assertEmailConfigured = () => {
  getConfiguredSmtpEmailConfig();
};

export async function sendEmailViaProvider({ to, subject, html }: SendEmailInput) {
  const config = getConfiguredSmtpEmailConfig();

  const transporter = createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: config.user,
      pass: config.password,
    },
  });
  const envelope = resolveEmailEnvelope(to, subject);

  return transporter.sendMail({
    from: config.from,
    to: envelope.to,
    subject: envelope.subject,
    html,
  });
}
