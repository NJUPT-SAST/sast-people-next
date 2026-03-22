import { redirect } from "next/navigation";
import Home from "./page";

jest.mock("next/navigation", () => ({
  redirect: jest.fn(),
}));

describe("Home Page", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it("redirects visitors to the dashboard route", async () => {
    await Home();
    expect(redirect).toHaveBeenCalledWith("/dashboard");
  });
});
