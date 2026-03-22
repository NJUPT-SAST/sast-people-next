import * as React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import SelectProblem from "./selectProblem";

const useProblems = jest.fn();
const useStepWithProblem = jest.fn();
const toastSuccess = jest.fn();
const toastError = jest.fn();
const stableInitialProbs = [{ id: 99, name: "旧题目", maxPoint: 10 }];

jest.mock("@/hooks/useProblemList", () => ({
  useProblems: (...args: unknown[]) => useProblems(...args),
}));

jest.mock("@/hooks/useStepWithProblem", () => ({
  useStepWithProblem: (...args: unknown[]) => useStepWithProblem(...args),
}));

jest.mock("@/hooks/useLocalProblemList", () => ({
  useLocalProblemList: () => stableInitialProbs,
}));

jest.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccess(...args),
    error: (...args: unknown[]) => toastError(...args),
  },
}));

jest.mock("./probCheckBox", () => ({
  __esModule: true,
  default: ({
    handleSave,
    probList,
  }: {
    handleSave: () => void;
    probList: Array<{ title: string }>;
  }) => (
    <div>
      <div>{probList.map((item) => item.title).join(",")}</div>
      <button type="button" onClick={handleSave}>
        保存范围
      </button>
    </div>
  ),
}));

jest.mock("@/components/ui/select", () => {
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
    SelectValue: ({ placeholder }: { placeholder?: string }) => <span>{placeholder}</span>,
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

describe("SelectProblem", () => {
  beforeEach(() => {
    useStepWithProblem.mockResolvedValue({ stepWithProblemId: 12 });
    useProblems.mockResolvedValue([{ id: 1, title: "算法题", score: 100 }]);
    toastSuccess.mockClear();
    toastError.mockClear();
    window.localStorage.clear();
  });

  it("loads problems for the selected flow and saves them to localStorage", async () => {
    const user = userEvent.setup();

    render(
      <SelectProblem flowList={[{ id: 3, title: "笔试流程" }] as never} />,
    );

    await user.click(screen.getByRole("button", { name: "笔试流程" }));

    await waitFor(() => {
      expect(useStepWithProblem).toHaveBeenCalledWith(3);
      expect(useProblems).toHaveBeenCalledWith(12);
      expect(screen.getByText("算法题")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "保存范围" }));

    expect(toastSuccess).toHaveBeenCalledWith("保存成功");
    expect(window.localStorage.getItem("people_selectedProbs")).toContain(
      "\"flowTypeId\":3",
    );
  });
});
