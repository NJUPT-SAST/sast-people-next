import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockUpdatePortfolioLink = jest.fn();

jest.mock("@/action/user-flow/portfolio", () => ({
  updatePortfolioLink: (...args: unknown[]) => mockUpdatePortfolioLink(...args),
}));

jest.mock("sonner", () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
  },
}));

import { PortfolioLinkEditor } from "./portfolioLinkEditor";

describe("PortfolioLinkEditor", () => {
  beforeEach(() => {
    mockUpdatePortfolioLink.mockReset();
  });

  it("allows editing while the flow is in progress", async () => {
    const user = userEvent.setup();
    render(
      <PortfolioLinkEditor
        userFlowId={1}
        initialValue="https://example.com/work"
        editable
      />,
    );

    expect(screen.getByRole("button", { name: /修改/ })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /修改/ }));
    expect(screen.getByPlaceholderText("https://...")).toBeInTheDocument();
  });

  it("locks the portfolio link after the flow ends", () => {
    render(
      <PortfolioLinkEditor
        userFlowId={1}
        initialValue="https://example.com/work"
        editable={false}
      />,
    );

    expect(screen.queryByRole("button", { name: /修改/ })).not.toBeInTheDocument();
    expect(screen.getByText("流程已结束，作品链接已锁定")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /example.com/ })).toBeInTheDocument();
  });
});
