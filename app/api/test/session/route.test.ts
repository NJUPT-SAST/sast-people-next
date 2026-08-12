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

  afterEach(() => {
    mockCreateSession.mockReset();
    if (originalTestMode === undefined) {
      delete process.env.PLAYWRIGHT_TEST_MODE;
    } else {
      process.env.PLAYWRIGHT_TEST_MODE = originalTestMode;
    }
  });

  it("is unavailable unless Playwright test mode is enabled", async () => {
    delete process.env.PLAYWRIGHT_TEST_MODE;

    const response = await POST(requestWithBody({ uid: 1, role: 3, name: "Admin" }) as never);

    expect(response.status).toBe(404);
    expect(mockCreateSession).not.toHaveBeenCalled();
  });

  it("creates a real session only for a complete test identity", async () => {
    process.env.PLAYWRIGHT_TEST_MODE = "1";

    const response = await POST(requestWithBody({ uid: 1, role: 3, name: "Admin" }) as never);

    expect(response.status).toBe(200);
    expect(mockCreateSession).toHaveBeenCalledWith(1, "Admin", 3);
  });
});
