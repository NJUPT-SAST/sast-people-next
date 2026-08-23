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
    mockUpdatePortfolioLink.mockReset().mockResolvedValue({ success: true });
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
    expect(screen.getByText("流程已结束，作品信息已锁定")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /example.com/ })).toBeInTheDocument();
  });

  it("shows and saves the portfolio description", async () => {
    const user = userEvent.setup();
    render(
      <PortfolioLinkEditor
        userFlowId={1}
        initialValue="https://example.com/work"
        initialDescription="旧简介"
        editable
      />,
    );

    expect(screen.getByText("旧简介")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /修改/ }));
    const description = screen.getByLabelText("作品简介");
    await user.clear(description);
    await user.type(description, "新简介");
    await user.click(screen.getByRole("button", { name: /保存/ }));

    expect(mockUpdatePortfolioLink).toHaveBeenCalledWith(
      1,
      "https://example.com/work",
      "新简介",
    );
    expect(await screen.findByText("新简介")).toBeInTheDocument();
  });
});
