/** @jest-environment node */

const mockDeleteSession = jest.fn();

jest.mock("@/lib/session", () => ({
  deleteSession: () => mockDeleteSession(),
}));

import { NextRequest } from "next/server";
import { GET } from "./route";

describe("logout route", () => {
  beforeEach(() => {
    mockDeleteSession.mockReset();
  });

  it("clears the session and preserves the Link authorization reason", async () => {
    const request = new NextRequest(
      "https://people.example/api/auth/logout?reason=link-authorization",
    );

    const response = await GET(request);

    expect(mockDeleteSession).toHaveBeenCalledTimes(1);
    expect(response.headers.get("location")).toBe(
      "https://people.example/login?reason=link-authorization",
    );
  });

  it("does not forward arbitrary logout reasons", async () => {
    const request = new NextRequest(
      "https://people.example/api/auth/logout?reason=unexpected",
    );

    const response = await GET(request);

    expect(response.headers.get("location")).toBe("https://people.example/login");
  });
});
