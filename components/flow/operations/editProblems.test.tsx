import * as React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { EditProblems } from "./editProblems";

const mockUpdateProblems = jest.fn().mockResolvedValue(undefined);
const mockToastPromise = jest.fn((promise: Promise<unknown>) => promise);

jest.mock("@/action/flow/problem/edit", () => ({
  updateProblems: (...args: Parameters<typeof mockUpdateProblems>) =>
    mockUpdateProblems(...args),
}));

jest.mock("sonner", () => ({
  toast: {
    promise: (...args: Parameters<typeof mockToastPromise>) =>
      mockToastPromise(...args),
  },
}));

jest.mock("../../ui/select", () => {
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
    }: {
      children: React.ReactNode;
      value: string;
    }) => {
      const { onValueChange } = React.useContext(SelectContext);
      return (
        <button type="button" onClick={() => onValueChange?.(value)}>
          {children}
        </button>
      );
    },
  };
});

describe("EditProblems", () => {
  beforeEach(() => {
    mockUpdateProblems.mockClear();
    mockToastPromise.mockClear();
  });

  it("adds, edits, and saves problems for the selected step", async () => {
    const user = userEvent.setup();

    render(
      <EditProblems
        currentStepId={1}
        flowTypeId={4}
        stepList={[
          { id: 1, title: "笔试", order: 1, description: null, fkFlowId: 4, problemCount: 1 },
          { id: 2, title: "面试", order: 2, description: null, fkFlowId: 4, problemCount: 2 },
        ]}
        problems={[{ id: 11, title: "算法题1", score: 20, fkFlowStepId: 1 }]}
      />,
    );

    await user.click(screen.getByRole("button", { name: "添加题目" }));
    await user.clear(screen.getByDisplayValue("新题目"));
    await user.type(screen.getAllByLabelText("题目名称")[1], "设计题");
    await user.click(screen.getByRole("button", { name: "面试" }));
    await user.click(screen.getByRole("button", { name: /保存/i }));

    await waitFor(() => {
      expect(mockUpdateProblems).toHaveBeenCalledWith(
        2,
        {
          default: expect.arrayContaining([
            expect.objectContaining({ title: "算法题1", fkFlowStepId: 2 }),
            expect.objectContaining({ title: "设计题", fkFlowStepId: 2 }),
          ]),
        },
        4,
      );
    });
  });
});
