import { StrictMode } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockReplace = jest.fn();
const mockRedirectFeishuOAuth = jest.fn();

jest.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
  useRouter: () => ({ replace: mockReplace }),
  useSearchParams: () =>
    new URLSearchParams("start=profile&feishuOAuth=link_identity_missing"),
}));

jest.mock("@/action/user/feishuOAuth", () => ({
  redirectFeishuOAuth: (...args: unknown[]) => mockRedirectFeishuOAuth(...args),
}));

import { FeishuOAuthFailureDialog } from "./feishu-oauth-failure-dialog";

const LINK_IDENTITY_MESSAGE =
  "绑定失败：当前 Link 账号尚未绑定飞书身份，请先在 Link 完成飞书绑定后重试。";

describe("FeishuOAuthFailureDialog", () => {
  const originalLinkProfileUrl = process.env.NEXT_PUBLIC_LINK_PROFILE_URL;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_LINK_PROFILE_URL = "https://link.example.com/";
    mockReplace.mockReset();
    mockRedirectFeishuOAuth.mockReset();
  });

  afterAll(() => {
    if (originalLinkProfileUrl === undefined) {
      delete process.env.NEXT_PUBLIC_LINK_PROFILE_URL;
    } else {
      process.env.NEXT_PUBLIC_LINK_PROFILE_URL = originalLinkProfileUrl;
    }
  });

  it("shows the failure in a centered dialog with a Link binding entry and cleans the URL", async () => {
    render(
      <StrictMode>
        <FeishuOAuthFailureDialog
          failure="link_identity_missing"
          message={LINK_IDENTITY_MESSAGE}
        />
      </StrictMode>,
    );

    expect(screen.getByRole("dialog")).toHaveTextContent(LINK_IDENTITY_MESSAGE);

    const link = screen.getByRole("link", { name: /去 Link 绑定飞书/ });
    expect(link).toHaveAttribute("href", "https://link.example.com/settings");
    expect(link).toHaveAttribute("target", "_blank");

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledTimes(1);
      expect(mockReplace).toHaveBeenCalledWith("/dashboard?start=profile");
    });
  });

  it("lets the user retry the OAuth flow after binding in Link", async () => {
    const user = userEvent.setup();
    render(
      <FeishuOAuthFailureDialog
        failure="identity_mismatch"
        message="绑定失败：请使用与当前 Link 账号绑定的同一个飞书账号授权。"
      />,
    );

    await user.click(screen.getByRole("button", { name: "重新绑定飞书" }));

    expect(mockRedirectFeishuOAuth).toHaveBeenCalledTimes(1);
    expect(mockRedirectFeishuOAuth.mock.calls[0][0]).toContain("/dashboard");
  });

  it("can be dismissed", async () => {
    const user = userEvent.setup();
    render(
      <FeishuOAuthFailureDialog
        failure="account_conflict"
        message="绑定失败：该飞书账号已绑定到另一位 People 用户，请联系管理员处理。"
      />,
    );

    await user.click(screen.getByRole("button", { name: "关闭" }));

    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
  });

  it("does nothing without a failure", () => {
    render(<FeishuOAuthFailureDialog />);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
