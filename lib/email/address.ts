const EDU_EMAIL_DOMAIN = "njupt.edu.cn";

export function getEducationEmail(studentId: string | null | undefined) {
  const normalized = studentId?.trim();
  if (!normalized) {
    throw new Error("Student ID is required to build the education email address");
  }
  return `${normalized}@${EDU_EMAIL_DOMAIN}`;
}

