import type { BrowserContext } from "@playwright/test";

type TestUser = {
  uid: number;
  role: number;
  name: string;
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
