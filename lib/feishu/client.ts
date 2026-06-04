import "server-only";

import * as lark from "@larksuiteoapi/node-sdk";

let client: lark.Client | null = null;

export function getFeishuClient() {
  if (!client) {
    const appId = process.env.APP_ID;
    const appSecret = process.env.APP_SECRET;
    if (!appId || !appSecret) {
      throw new Error("APP_ID and APP_SECRET are required for Feishu integration");
    }
    client = new lark.Client({
      appId,
      appSecret,
      disableTokenCache: false,
    });
  }
  return client;
}

export async function getFeishuTenantAccessToken() {
  const res = await getFeishuClient().auth.tenantAccessToken.internal({
    data: {
      app_id: process.env.APP_ID as string,
      app_secret: process.env.APP_SECRET as string,
    },
  });
  const token = (res as { tenant_access_token?: string }).tenant_access_token;
  if (!token) {
    throw new Error("get tenant access token failed");
  }
  return token;
}

export async function getFeishuAppAccessToken() {
  const data = await getFeishuClient().auth.appAccessToken.internal({
    data: {
      app_id: process.env.APP_ID as string,
      app_secret: process.env.APP_SECRET as string,
    },
  });
  const token = (data as { app_access_token?: string }).app_access_token;
  if (!token) {
    throw new Error("get app access token failed");
  }
  return token;
}
