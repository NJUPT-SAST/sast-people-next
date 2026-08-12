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
  db: { insert: jest.fn() },
}));

jest.mock("@/lib/secret", () => ({
  encryptSecret: jest.fn((value: string) => `encrypted:${value}`),
  decryptSecret: jest.fn(),
}));

import { createSession } from "./session";
import { db } from "@/db/drizzle";

const mockInsert = jest.mocked(db.insert);
const mockValues = jest.fn();

describe("server sessions", () => {
  beforeEach(() => {
    mockCookieStore.get.mockReset();
    mockCookieStore.set.mockReset();
    mockCookieStore.delete.mockReset();
    mockInsert.mockReset();
    mockInsert.mockReturnValue({ values: mockValues } as never);
    mockValues.mockReset();
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
    expect(cookieName).toBe("session");
    expect(sessionId).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(sessionId).not.toContain("access-token");
    expect(sessionId).not.toContain("refresh-token");
  });
});
