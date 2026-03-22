import * as React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { EditUserFlowSheet } from "./editUserFlowSheet";

jest.mock("@/hooks/useFlowListClient", () => ({
  useFlowListClient: () => ({
    data: [
      { id: 1, title: "笔试流程" },
      { id: 2, title: "终试流程" },
    ],
  }),
}));

jest.mock("./flowCardClient", () => ({
  FlowCard: ({ flow }: { flow: { title: string } }) => <div>{flow.title}</div>,
}));

jest.mock("../ui/sheet", () => ({
  Sheet: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SheetTrigger: ({ children }: { children: React.ReactNode }) => (
    <button type="button">{children}</button>
  ),
  SheetContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SheetHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SheetTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SheetDescription: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

jest.mock("../ui/select", () => {
  const SelectContext = React.createContext<{ onValueChange?: (value: string) => void }>({});

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
    SelectTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    SelectContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    SelectItem: ({ children, value }: { children: React.ReactNode; value: string }) => {
      const { onValueChange } = React.useContext(SelectContext);
      return (
        <button type="button" onClick={() => onValueChange?.(value)}>
          {children}
        </button>
      );
    },
  };
});

describe("EditUserFlowSheet", () => {
  it("switches the selected flow and renders the related flow card", async () => {
    const user = userEvent.setup();

    render(<EditUserFlowSheet userInfo={{ id: 1, name: "张三" } as never} />);

    expect(
      screen.getByText((_, element) =>
        element?.textContent === "编辑 张三 的流程",
      ),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "终试流程" }));

    expect(screen.getAllByText("终试流程").length).toBeGreaterThan(1);
  });
});
