const EDU_EMAIL_DOMAIN = "njupt.edu.cn";

export function getEducationEmail(studentId: string | null | undefined) {
  const normalized = studentId?.trim();
  if (!normalized) {
    throw new Error("Student ID is required to build the education email address");
  }
  return `${normalized}@${EDU_EMAIL_DOMAIN}`;
}

export function normalizeEducationEmailInput(value: string) {
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    throw new Error("请输入测试收件地址。");
  }

  const email = normalized.includes("@")
    ? normalized
    : getEducationEmail(normalized);

  if (!email.endsWith(`@${EDU_EMAIL_DOMAIN}`)) {
    throw new Error("测试收件地址必须是南邮教育邮箱。");
  }

  return email;
}
