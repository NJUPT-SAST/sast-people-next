/** @jest-environment node */

import { NextRequest } from "next/server";

import { SESSION } from "@/const/cookie";
import { decrypt } from "@/lib/session";

import { proxy } from "./proxy";

jest.mock("@/lib/session", () => ({
  decrypt: jest.fn(),
}));

const mockDecrypt = jest.mocked(decrypt);

function createRequest(path: string, session?: string) {
  return new NextRequest(`http://localhost${path}`, {
    headers: session ? { cookie: `${SESSION}=${session}` } : undefined,
  });
}

describe("proxy", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("redirects anonymous dashboard requests to login without logging request data", async () => {
    mockDecrypt.mockResolvedValue(null);
    const log = jest.spyOn(console, "log").mockImplementation();

    const response = await proxy(createRequest("/dashboard"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost/login");
    expect(log).not.toHaveBeenCalled();
  });

  it("redirects authenticated users away from public routes", async () => {
    mockDecrypt.mockResolvedValue({ uid: 1, name: "Admin", role: 3 });

    const response = await proxy(createRequest("/login", "encrypted-session"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost/dashboard");
  });

  it("allows authenticated dashboard requests to continue", async () => {
    mockDecrypt.mockResolvedValue({ uid: 1, name: "Admin", role: 3 });

    const response = await proxy(createRequest("/dashboard/emails", "encrypted-session"));

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });
});
