import "server-only";

import type { LinkResponse } from "@/lib/link/types";

type LinkFetchOptions = {
  accessToken?: string;
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
};

export class LinkApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: number,
  ) {
    super(message);
    this.name = "LinkApiError";
  }
}

export const shouldUseMockLink = () => process.env.LINK_USE_MOCK === "true";

export const shouldUseLinkFeishuTestMock = () =>
  process.env.NODE_ENV !== "production" &&
  process.env.LINK_LOGIN_FEISHU_TEST_MOCK === "true";

export const getLinkBaseUrl = () => {
  const baseUrl = process.env.LINK_API_BASE_URL;
  if (!baseUrl) {
    throw new Error("LINK_API_BASE_URL environment variable is not set");
  }
  return baseUrl.replace(/\/$/, "");
};

export const linkFetch = async <T>(
  path: string,
  { accessToken, method = "GET", body, query }: LinkFetchOptions = {},
): Promise<T> => {
  const url = new URL(`${getLinkBaseUrl()}${path}`);
  Object.entries(query ?? {}).forEach(([key, value]) => {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  });

  const response = await fetch(url, {
    method,
    headers: {
      Accept: "application/json",
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new LinkApiError(
      payload?.message ?? `Link API request failed: ${response.status}`,
      response.status,
      payload?.code,
    );
  }

  if (payload && typeof payload === "object" && "code" in payload) {
    const envelope = payload as LinkResponse<T>;
    if (envelope.code !== 0) {
      throw new LinkApiError(envelope.message, response.status, envelope.code);
    }
    return envelope.data;
  }

  return payload as T;
};
