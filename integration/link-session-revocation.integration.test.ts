/** @jest-environment node */

/**
 * Link refresh token 被整族撤销后的会话凭据清理（issue #266）：
 * - 命中终态 `400 invalid_grant` 时清掉该用途的 Link 凭据（列置 null），调用方按
 *   「缺 token」处理，不再每个请求都打一次注定失败的 refresh；
 * - 清理在行锁内以「刚失败的 refresh token 仍是当前存值」为条件 —— 另一实例已经轮换
 *   出来的新凭据不会被误清（`refreshInFlight` 只协调单个实例）。
 */

const mockCookieStore = {
  get: jest.fn(),
  set: jest.fn(),
  delete: jest.fn(),
};

jest.mock("server-only", () => ({}));
jest.mock("next/headers", () => ({
  cookies: jest.fn(async () => mockCookieStore),
}));
jest.mock("@/lib/link/client", () => ({
  shouldUseMockLink: () => false,
}));
jest.mock("@/lib/link/oauth", () => ({
  ...jest.requireActual("@/lib/link/oauth"),
  refreshLinkOAuthToken: jest.fn(),
}));

import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { peopleSession } from "@/db/schema";
import { SESSION } from "@/const/cookie";
import { decryptSecret, encryptSecret } from "@/lib/secret";
import { LinkOAuthTokenError, refreshLinkOAuthToken } from "@/lib/link/oauth";
import {
  getLinkAccessTokenFromSession,
  MissingLinkAccessTokenError,
} from "@/lib/link/session";
import { clearLinkSessionTokens } from "@/lib/session";

const TEST_UID = 902_101;
const REVOKED_REFRESH_TOKEN = "revoked-refresh";

if (!process.env.SESSION_SECRET) {
  process.env.SESSION_SECRET = "integration-test-session-secret";
}

const insertSession = async (refreshToken: string) => {
  const id = crypto.randomBytes(32).toString("base64url");
  await db.insert(peopleSession).values({
    id,
    uid: TEST_UID,
    name: "集成测试会话",
    role: 1,
    expiresAt: new Date(Date.now() + 3_600_000),
    linkAccessToken: encryptSecret("old-access"),
    linkRefreshToken: encryptSecret(refreshToken),
    linkAccessTokenExpiresAt: new Date(Date.now() - 1_000),
  });
  return id;
};

const readSession = async (id: string) => {
  const [record] = await db
    .select()
    .from(peopleSession)
    .where(eq(peopleSession.id, id));
  return record;
};

describe("Link 撤销后的凭据清理", () => {
  beforeEach(async () => {
    await db.delete(peopleSession).where(eq(peopleSession.uid, TEST_UID));
    mockCookieStore.get.mockReset();
    jest.mocked(refreshLinkOAuthToken).mockReset();
  });

  afterAll(async () => {
    await db.delete(peopleSession).where(eq(peopleSession.uid, TEST_UID));
  });

  it("清掉仍是当前存值的 refresh token 对应的凭据", async () => {
    const id = await insertSession(REVOKED_REFRESH_TOKEN);

    await expect(
      clearLinkSessionTokens(id, "session", REVOKED_REFRESH_TOKEN),
    ).resolves.toBe(true);

    const record = await readSession(id);
    expect(record.linkAccessToken).toBeNull();
    expect(record.linkRefreshToken).toBeNull();
    expect(record.linkAccessTokenExpiresAt).toBeNull();
  });

  it("不清另一实例已经轮换出的新凭据", async () => {
    const id = await insertSession("newer-refresh");

    await expect(
      clearLinkSessionTokens(id, "session", REVOKED_REFRESH_TOKEN),
    ).resolves.toBe(false);

    const record = await readSession(id);
    expect(decryptSecret(record.linkRefreshToken!)).toBe("newer-refresh");
    expect(record.linkAccessTokenExpiresAt).not.toBeNull();
  });

  it("终态撤销后后续请求不再打 Link，直接按缺 token 处理", async () => {
    const id = await insertSession(REVOKED_REFRESH_TOKEN);
    mockCookieStore.get.mockImplementation((name: string) =>
      name === SESSION ? { value: id } : undefined,
    );
    jest.mocked(refreshLinkOAuthToken).mockRejectedValue(
      new LinkOAuthTokenError("refresh token revoked", 400, "invalid_grant"),
    );

    await expect(getLinkAccessTokenFromSession()).rejects.toBeInstanceOf(
      MissingLinkAccessTokenError,
    );

    const record = await readSession(id);
    expect(record.linkRefreshToken).toBeNull();

    await expect(getLinkAccessTokenFromSession()).rejects.toBeInstanceOf(
      MissingLinkAccessTokenError,
    );
    expect(jest.mocked(refreshLinkOAuthToken)).toHaveBeenCalledTimes(1);
  });
});
