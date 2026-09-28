import type { BrowserContext } from "@playwright/test";

type TestUser = {
  uid: number;
  role: number;
  name: string;
  /** 部门隔离用 Link 部门标识：部门级页面（流程/笔试/面试/成员目录/邮件/审计）必须带上 */
  department?: string;
};

export async function signInAs(context: BrowserContext, user: TestUser) {
  await context.clearCookies();
  const response = await context.request.post("/api/test/session", {
    data: user,
  });
  if (!response.ok()) {
    throw new Error(`Unable to create E2E session: ${response.status()}`);
  }
}
