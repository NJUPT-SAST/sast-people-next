import * as React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockUpdatePortfolioLink = jest.fn();
const mockUpdateApplyGroup = jest.fn();

jest.mock("@/action/user-flow/portfolio", () => ({
  updatePortfolioLink: (...args: unknown[]) => mockUpdatePortfolioLink(...args),
}));

jest.mock("@/action/user-flow/apply-group", () => ({
  updateApplyGroup: (...args: unknown[]) => mockUpdateApplyGroup(...args),
}));

jest.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: jest.fn() }),
}));

jest.mock("sonner", () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock("../ui/select", () => {
  const SelectContext = React.createContext<{
    onValueChange?: (value: string) => void;
  }>({});

  return {
    Select: ({
      children,
      onValueChange,
    }: {
      children: React.ReactNode;
      onValueChange?: (value: string) => void;
    }) => (
      <SelectContext.Provider value={{ onValueChange }}>
        <div>{children}</div>
      </SelectContext.Provider>
    ),
    SelectTrigger: ({ children }: { children: React.ReactNode }) => (
      <div>{children}</div>
    ),
    SelectValue: ({ placeholder }: { placeholder?: string }) => (
      <span>{placeholder}</span>
    ),
    SelectContent: ({ children }: { children: React.ReactNode }) => (
      <div>{children}</div>
    ),
    SelectItem: ({
      children,
      value,
      disabled,
    }: {
      children: React.ReactNode;
      value: string;
      disabled?: boolean;
    }) => {
      const { onValueChange } = React.useContext(SelectContext);
      return (
        <button
          type="button"
          disabled={disabled}
          onClick={() => onValueChange?.(value)}
        >
          {children}
        </button>
      );
    },
  };
});

import { PortfolioLinkEditor } from "./portfolioLinkEditor";

describe("PortfolioLinkEditor", () => {
  beforeEach(() => {
    mockUpdatePortfolioLink.mockReset().mockResolvedValue({ success: true });
    mockUpdateApplyGroup.mockReset().mockResolvedValue({ success: true });
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
    expect(screen.getByText("流程已结束，报名信息已锁定")).toBeInTheDocument();
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
  it("rejects an invalid portfolio URL before saving", async () => {
    const user = userEvent.setup();
    render(
      <PortfolioLinkEditor
        userFlowId={1}
        initialValue="https://example.com/work"
        editable
      />,
    );

    await user.click(screen.getByRole("button", { name: /修改/ }));
    const input = screen.getByPlaceholderText("https://...");
    await user.clear(input);
    await user.type(input, "not a url");
    await user.click(screen.getByRole("button", { name: /保存/ }));

    expect(screen.getByRole("alert")).toHaveTextContent("作品链接格式不正确");
    expect(mockUpdatePortfolioLink).not.toHaveBeenCalled();
  });

  it("hides the apply group block when the flow has no group options", () => {
    render(
      <PortfolioLinkEditor
        userFlowId={1}
        initialValue="https://example.com/work"
        applyGroupOptions={[]}
        editable
      />,
    );

    expect(screen.queryByText("投递组别")).not.toBeInTheDocument();
  });

  it("requires a group before saving the apply group", async () => {
    const user = userEvent.setup();
    render(
      <PortfolioLinkEditor
        userFlowId={1}
        initialValue="https://example.com/work"
        applyGroupOptions={["前端组", "后端组"]}
        editable
      />,
    );

    await user.click(screen.getByRole("button", { name: /修改/ }));
    await user.click(screen.getByRole("button", { name: /保存/ }));

    expect(screen.getByRole("alert")).toHaveTextContent("请选择投递组别");
    expect(mockUpdateApplyGroup).not.toHaveBeenCalled();
  });

  it("saves a new apply group choice", async () => {
    const user = userEvent.setup();
    render(
      <PortfolioLinkEditor
        userFlowId={1}
        initialValue="https://example.com/work"
        applyGroup="前端组"
        applyGroupOptions={["前端组", "后端组"]}
        editable
      />,
    );

    await user.click(screen.getByRole("button", { name: /修改/ }));
    await user.click(screen.getByRole("button", { name: "后端组" }));
    await user.click(screen.getByRole("button", { name: /保存/ }));

    await waitFor(() => {
      expect(mockUpdateApplyGroup).toHaveBeenCalledWith(1, "后端组");
      expect(mockUpdatePortfolioLink).not.toHaveBeenCalled();
    });
    expect(screen.getByText("后端组")).toBeInTheDocument();
  });

  it("only saves portfolio fields when the group is unchanged", async () => {
    const user = userEvent.setup();
    render(
      <PortfolioLinkEditor
        userFlowId={1}
        initialValue="https://example.com/work"
        applyGroup="前端组"
        applyGroupOptions={["前端组", "后端组"]}
        editable
      />,
    );

    await user.click(screen.getByRole("button", { name: /修改/ }));
    const description = screen.getByLabelText("作品简介");
    await user.type(description, "新简介");
    await user.click(screen.getByRole("button", { name: /保存/ }));

    await waitFor(() => {
      expect(mockUpdatePortfolioLink).toHaveBeenCalledWith(
        1,
        "https://example.com/work",
        "新简介",
      );
      expect(mockUpdateApplyGroup).not.toHaveBeenCalled();
    });
  });

  it("treats normalized unchanged values as a successful no-op", async () => {
    const user = userEvent.setup();
    render(
      <PortfolioLinkEditor
        userFlowId={1}
        initialValue="https://example.com/work"
        initialDescription="作品简介"
        applyGroup="前端组"
        applyGroupOptions={["前端组", "后端组"]}
        editable
      />,
    );

    await user.click(screen.getByRole("button", { name: /修改/ }));
    await user.type(screen.getByLabelText("作品链接"), "  ");
    await user.type(screen.getByLabelText("作品简介"), "  ");
    await user.click(screen.getByRole("button", { name: /保存/ }));

    await waitFor(() => {
      expect(mockUpdatePortfolioLink).not.toHaveBeenCalled();
      expect(mockUpdateApplyGroup).not.toHaveBeenCalled();
      expect(screen.getByRole("button", { name: /修改/ })).toBeInTheDocument();
    });
  });

  it("cancels editing and restores the previous values", async () => {
    const user = userEvent.setup();
    render(
      <PortfolioLinkEditor
        userFlowId={1}
        initialValue="https://example.com/work"
        applyGroup="前端组"
        applyGroupOptions={["前端组", "后端组"]}
        editable
      />,
    );

    await user.click(screen.getByRole("button", { name: /修改/ }));
    const input = screen.getByPlaceholderText("https://...");
    await user.clear(input);
    await user.type(input, "https://example.com/changed");
    await user.click(screen.getByRole("button", { name: /取消/ }));

    expect(screen.getByRole("button", { name: /修改/ })).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /example.com\/work/ }),
    ).toBeInTheDocument();
    expect(mockUpdatePortfolioLink).not.toHaveBeenCalled();
  });
});
