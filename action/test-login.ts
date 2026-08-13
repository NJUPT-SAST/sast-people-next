"use server";

import { listLinkUsers } from "@/lib/link/admin";
import { shouldUseMockLink } from "@/lib/link/client";
import { linkRoleToPeopleRole } from "@/lib/link/role";
import { createSession } from "@/lib/session";

export async function loginWithMockLinkUser(formData: FormData) {
  if (process.env.NODE_ENV === "production" || !shouldUseMockLink()) {
    throw new Error("测试登录仅在本地 Link mock 环境可用。");
  }

  const studentId = String(formData.get("studentId") ?? "").trim().toUpperCase();
  if (!studentId) {
    throw new Error("请输入测试学号。");
  }

  const result = await listLinkUsers("mock-link-access-token", {
    page: 1,
    pageSize: 1,
    studentId,
  });
  const user = result.users[0];
  if (!user || user.state === "is_deleted") {
    throw new Error("未找到可登录的测试账号。");
  }

  await createSession(user.id, user.name, linkRoleToPeopleRole(user.role));
}
