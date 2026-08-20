import { StrictMode } from "react";
import { render, waitFor } from "@testing-library/react";
import { toast } from "sonner";
import { FeishuOAuthFailureToast } from "./feishu-oauth-failure-toast";

const mockReplace = jest.fn();
const mockSearchParams = new URLSearchParams("start=profile&feishuOAuth=link_identity_missing");

jest.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
  useRouter: () => ({ replace: mockReplace }),
  useSearchParams: () => mockSearchParams,
}));
jest.mock("sonner", () => ({
  toast: { error: jest.fn() },
}));

describe("FeishuOAuthFailureToast", () => {
  beforeEach(() => {
    mockReplace.mockReset();
    jest.mocked(toast.error).mockReset();
  });

  it("shows the failure once and removes its query parameter", async () => {
    render(
      <StrictMode>
        <FeishuOAuthFailureToast message="绑定失败" />
      </StrictMode>,
    );

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledTimes(1);
      expect(toast.error).toHaveBeenCalledWith("绑定失败");
      expect(mockReplace).toHaveBeenCalledTimes(1);
      expect(mockReplace).toHaveBeenCalledWith("/dashboard?start=profile");
    });
  });

  it("does nothing when the callback has no failure", () => {
    render(<FeishuOAuthFailureToast />);

    expect(toast.error).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
