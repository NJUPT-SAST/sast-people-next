/** @jest-environment node */

const mockCookieStore = {
  get: jest.fn(),
  set: jest.fn(),
  delete: jest.fn(),
};

jest.mock("next/headers", () => ({
  cookies: jest.fn(async () => mockCookieStore),
}));

jest.mock("@/db/drizzle", () => ({
  db: { insert: jest.fn(), update: jest.fn(), delete: jest.fn(), select: jest.fn() },
}));

jest.mock("@/lib/secret", () => ({
  encryptSecret: jest.fn((value: string) => `encrypted:${value}`),
  decryptSecret: jest.fn(),
}));

import {
  createSession,
  deleteExpiredSessions,
  getSessionById,
  updateLinkSessionTokens,
} from "./session";
import { db } from "@/db/drizzle";
import { decryptSecret } from "@/lib/secret";
import { ADMIN_ROLE } from "@/lib/link/role";
import { SESSION, VIEW_AS } from "@/const/cookie";

const mockInsert = jest.mocked(db.insert);
const mockValues = jest.fn();
const mockUpdate = jest.mocked(db.update);
const mockUpdateSet = jest.fn(() => ({ where: jest.fn() }));
const mockDelete = jest.mocked(db.delete);
const mockDeleteWhere = jest.fn(() => ({ returning: jest.fn() }));
const mockSelect = jest.mocked(db.select);
const mockSelectLimit = jest.fn();
const mockSelectWhere = jest.fn(() => ({ limit: mockSelectLimit }));

describe("server sessions", () => {
  beforeEach(() => {
    mockCookieStore.get.mockReset();
    mockCookieStore.set.mockReset();
    mockCookieStore.delete.mockReset();
    mockInsert.mockReset();
    mockInsert.mockReturnValue({ values: mockValues } as never);
    mockValues.mockReset();
    mockUpdate.mockReset();
    mockUpdate.mockReturnValue({ set: mockUpdateSet } as never);
    mockUpdateSet.mockClear();
    mockDelete.mockReset();
    mockDelete.mockReturnValue({ where: mockDeleteWhere } as never);
    mockDeleteWhere.mockClear();
    mockSelect.mockReset();
    mockSelectWhere.mockClear();
    mockSelectLimit.mockReset();
  });

  it("stores Link credentials encrypted on the server and sets only an opaque ID cookie", async () => {
    await createSession(42, "Admin", 3, {
      accessToken: "access-token",
      refreshToken: "refresh-token",
      accessTokenExpiresAt: Date.now() + 3600_000,
    });

    const storedSession = mockValues.mock.calls[0][0];
    expect(storedSession).toMatchObject({
      uid: 42,
      linkAccessToken: "encrypted:access-token",
      linkRefreshToken: "encrypted:refresh-token",
    });

    const [cookieName, sessionId] = mockCookieStore.set.mock.calls[0];
    expect(cookieName).toBe(SESSION);
    expect(sessionId).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(sessionId).not.toContain("access-token");
    expect(sessionId).not.toContain("refresh-token");
  });

  it("marks a one-pass administrator session without duplicating its refresh token", async () => {
    await createSession(
      42,
      "Admin",
      3,
      {
        accessToken: "access-token",
        refreshToken: "refresh-token",
        accessTokenExpiresAt: Date.now() + 3600_000,
      },
      {
        accessToken: "access-token",
        accessTokenExpiresAt: Date.now() + 3600_000,
      },
    );

    expect(mockValues.mock.calls[0][0]).toMatchObject({
      linkAdminAccessToken: "encrypted:access-token",
      linkAdminRefreshToken: null,
    });
  });

  it("updates only admin credentials when refreshing an admin token", async () => {
    await updateLinkSessionTokens("a".repeat(43), "admin", {
      accessToken: "admin-access",
      accessTokenExpiresAt: Date.now() + 3600_000,
    });

    expect(mockUpdateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        linkAdminAccessToken: "encrypted:admin-access",
      }),
    );
    expect(mockUpdateSet).toHaveBeenCalledWith(
      expect.not.objectContaining({ linkAccessToken: expect.anything() }),
    );
  });

  it("does not load expired session records", async () => {
    mockSelect.mockReturnValue({
      from: jest.fn(() => ({ where: mockSelectWhere })),
    } as never);
    mockSelectLimit.mockResolvedValue([]);

    await expect(getSessionById("a".repeat(43))).resolves.toBeNull();
    const selectWhere = (mockSelectWhere.mock.calls as unknown[][])[0]?.[0] as {
      queryChunks?: unknown[];
    };
    expect(selectWhere.queryChunks).toHaveLength(3);
    const combinedConditions = (selectWhere.queryChunks?.[1] as {
      queryChunks?: unknown[];
    })?.queryChunks;
    const expirationCondition = combinedConditions?.[2] as {
      queryChunks?: Array<{ name?: string; value?: string[] }>;
    };
    expect(expirationCondition.queryChunks?.[1]).toMatchObject({
      name: "expires_at",
    });
    expect(expirationCondition.queryChunks?.[2]).toMatchObject({
      value: [" > "],
    });
    expect(mockSelectLimit).toHaveBeenCalledWith(1);
  });

  it("deletes expired session records", async () => {
    const mockReturning = jest.fn().mockResolvedValue([{ id: "old" }]);
    mockDeleteWhere.mockReturnValue({ returning: mockReturning });

    await expect(deleteExpiredSessions(new Date("2026-08-12T00:00:00.000Z"))).resolves.toBe(1);
    const deleteWhere = (mockDeleteWhere.mock.calls as unknown[][])[0]?.[0] as {
      queryChunks?: unknown[];
    };
    const deleteCondition = deleteWhere.queryChunks as Array<{
      name?: string;
      value?: string[];
    }>;
    expect(deleteCondition[1]).toMatchObject({ name: "expires_at" });
    expect(deleteCondition[2]).toMatchObject({ value: [" < "] });
  });
});

describe("管理员切换身份查看", () => {
  const sessionRecord = (role: number, department: string | null) => ({
    id: "a".repeat(43),
    uid: 42,
    name: "Admin",
    role,
    department,
    departmentSyncedAt: null,
    expiresAt: new Date(Date.now() + 3600_000),
    linkAccessToken: null,
    linkRefreshToken: null,
    linkAccessTokenExpiresAt: null,
    linkAdminAccessToken: null,
    linkAdminRefreshToken: null,
    linkAdminAccessTokenExpiresAt: null,
  });

  const withSessionRecord = (record: unknown, viewAsCookie?: string) => {
    mockSelect.mockReturnValue({
      from: jest.fn(() => ({ where: mockSelectWhere })),
    } as never);
    mockSelectLimit.mockResolvedValue([record]);
    mockCookieStore.get.mockImplementation((name: string) =>
      name === VIEW_AS && viewAsCookie ? { value: viewAsCookie } : undefined,
    );
  };

  beforeEach(() => {
    mockCookieStore.get.mockReset();
    mockSelect.mockReset();
    mockSelectWhere.mockClear();
    mockSelectLimit.mockReset();
    jest.mocked(decryptSecret).mockReset();
  });

  it("以管理员身份读取时套用临时视角，同时保留真实角色", async () => {
    withSessionRecord(sessionRecord(ADMIN_ROLE, null), "encoded");
    jest
      .mocked(decryptSecret)
      .mockReturnValue(JSON.stringify({ role: 2, department: "software" }));

    const session = await getSessionById("a".repeat(43));

    expect(session).toMatchObject({
      role: 2,
      realRole: ADMIN_ROLE,
      department: "software",
      viewAs: { role: 2, department: "software" },
    });
  });

  it("非管理员会话完全忽略该 cookie：伪造也提不了权", async () => {
    withSessionRecord(sessionRecord(1, "media"), "encoded");
    jest
      .mocked(decryptSecret)
      .mockReturnValue(JSON.stringify({ role: 4, department: null }));

    const session = await getSessionById("a".repeat(43));

    expect(session).toMatchObject({
      role: 1,
      realRole: 1,
      department: "media",
      viewAs: null,
    });
    /* 连解密都不该发生：非管理员会话直接跳过这段逻辑 */
    expect(decryptSecret).not.toHaveBeenCalled();
  });

  it("密文损坏时按未切换处理，不影响正常浏览", async () => {
    withSessionRecord(sessionRecord(ADMIN_ROLE, null), "broken");
    jest.mocked(decryptSecret).mockImplementation(() => {
      throw new Error("Unsupported encrypted secret format");
    });

    const session = await getSessionById("a".repeat(43));

    expect(session).toMatchObject({
      role: ADMIN_ROLE,
      realRole: ADMIN_ROLE,
      viewAs: null,
    });
  });
});
