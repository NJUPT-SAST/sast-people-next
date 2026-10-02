/** @jest-environment node */

const mockCreateSession = jest.fn();

jest.mock("@/lib/session", () => ({
  createSession: (...args: unknown[]) => mockCreateSession(...args),
}));

import { POST } from "./route";

const requestWithBody = (body: unknown) =>
  new Request("http://localhost/api/test/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

describe("Playwright test session route", () => {
  const originalTestMode = process.env.PLAYWRIGHT_TEST_MODE;
  /* NODE_ENV 在类型上是只读的，测试里需要临时改写 */
  const nodeEnv = process.env as Record<string, string | undefined>;
  const originalNodeEnv = nodeEnv.NODE_ENV;

  afterEach(() => {
    mockCreateSession.mockReset();
    if (originalTestMode === undefined) {
      delete process.env.PLAYWRIGHT_TEST_MODE;
    } else {
      process.env.PLAYWRIGHT_TEST_MODE = originalTestMode;
    }
    if (originalNodeEnv === undefined) {
      delete nodeEnv.NODE_ENV;
    } else {
      nodeEnv.NODE_ENV = originalNodeEnv;
    }
  });

  it("is unavailable unless Playwright test mode is enabled", async () => {
    delete process.env.PLAYWRIGHT_TEST_MODE;

    const response = await POST(requestWithBody({ uid: 1, role: 3, name: "Admin" }) as never);

    expect(response.status).toBe(404);
    expect(mockCreateSession).not.toHaveBeenCalled();
  });

  it("stays unreachable in production even with test mode enabled", async () => {
    process.env.PLAYWRIGHT_TEST_MODE = "1";
    nodeEnv.NODE_ENV = "production";

    const response = await POST(requestWithBody({ uid: 1, role: 4, name: "Admin" }) as never);

    expect(response.status).toBe(404);
    expect(mockCreateSession).not.toHaveBeenCalled();
  });

  it("creates a real session only for a complete test identity", async () => {
    process.env.PLAYWRIGHT_TEST_MODE = "1";

    const response = await POST(requestWithBody({ uid: 1, role: 3, name: "Admin" }) as never);

    expect(response.status).toBe(200);
    expect(mockCreateSession).toHaveBeenCalledWith(
      1,
      "Admin",
      3,
      expect.objectContaining({
        accessToken: "playwright-link-access-token",
        accessTokenExpiresAt: expect.any(Number),
      }),
      expect.objectContaining({
        accessToken: "playwright-link-access-token",
        accessTokenExpiresAt: expect.any(Number),
      }),
      null,
    );
  });

  it("carries the department for department-scoped test sessions", async () => {
    process.env.PLAYWRIGHT_TEST_MODE = "1";

    await POST(
      requestWithBody({
        uid: 7,
        role: 2,
        name: "Lecturer",
        department: "software",
      }) as never,
    );

    expect(mockCreateSession).toHaveBeenCalledWith(
      7,
      "Lecturer",
      2,
      expect.anything(),
      expect.anything(),
      "software",
    );
  });
});
