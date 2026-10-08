/** @jest-environment node */

const mockCookieStore = { set: jest.fn(), delete: jest.fn() };
const mockRedirect = jest.fn();

jest.mock("next/headers", () => ({ cookies: async () => mockCookieStore }));
jest.mock("next/navigation", () => ({ redirect: (url: string) => mockRedirect(url) }));
jest.mock("@/lib/dal", () => ({ verifySession: async () => ({ uid: 1, role: 2 }) }));
jest.mock("@/lib/feishu/oauth-account", () => ({ getFeishuOAuthAccountStatus: jest.fn() }));
jest.mock("@/lib/app-url", () => ({ getPublicBaseUrl: () => "https://people.example" }));

import { redirectFeishuOAuth } from "./feishuOAuth";
import { FEISHU_OAUTH_RETURN_TO } from "@/const/cookie";

const originalAppId = process.env.APP_ID;
beforeAll(() => { process.env.APP_ID = "test-app"; });
afterAll(() => {
  if (originalAppId === undefined) delete process.env.APP_ID;
  else process.env.APP_ID = originalAppId;
});

it.each([
  "/dashboard",
  "/dashboard?start=profile",
  "/dashboard/interviews",
  "/dashboard/interviews?flowId=12",
  "/dashboard#profile",
])("stores the dashboard return destination %s", async (returnTo) => {
  await redirectFeishuOAuth(returnTo);
  expect(mockCookieStore.set).toHaveBeenCalledWith(
    FEISHU_OAUTH_RETURN_TO, returnTo, expect.objectContaining({ httpOnly: true }),
  );
  expect(mockCookieStore.delete).not.toHaveBeenCalledWith(FEISHU_OAUTH_RETURN_TO);
  expect(mockRedirect).toHaveBeenCalled();
});

it.each([
  undefined, "", "/", "/dashboard-other", "/dashboardevil?start=profile",
  "https://evil.example/dashboard", "//evil.example/dashboard",
  "/dashboard/../admin", "/dashboard/%2e%2e/admin",
])("clears an invalid return destination %s", async (returnTo) => {
  await redirectFeishuOAuth(returnTo);
  expect(mockCookieStore.delete).toHaveBeenCalledWith(FEISHU_OAUTH_RETURN_TO);
  expect(mockCookieStore.set).not.toHaveBeenCalledWith(
    FEISHU_OAUTH_RETURN_TO, expect.anything(), expect.anything(),
  );
});
