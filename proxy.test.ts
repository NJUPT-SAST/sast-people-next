/** @jest-environment node */

import { NextRequest } from "next/server";

import { SESSION } from "@/const/cookie";
import { proxy } from "./proxy";

const validSessionId = "a".repeat(43);

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
    const log = jest.spyOn(console, "log").mockImplementation();

    const response = await proxy(createRequest("/dashboard"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost/login");
    expect(log).not.toHaveBeenCalled();
  });

  it("does not treat an opaque ID as an authenticated identity on public routes", async () => {
    const response = await proxy(createRequest("/login", validSessionId));

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });

  it("allows authenticated dashboard requests to continue", async () => {
    const response = await proxy(createRequest("/dashboard/emails", validSessionId));

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });
});
