import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as React from "react";

import { AddFlow } from "./add";

// Radix Select needs pointer-capture plumbing that jsdom lacks; items render as
// buttons so the office-flow path can be driven directly.
jest.mock("../ui/select", () => {
  const SelectContext = React.createContext<{
    onValueChange?: (value: string) => void;
  }>({});

  return {
    Select: ({
      children,
      onValueChange,
      disabled,
    }: {
      children: React.ReactNode;
      onValueChange?: (value: string) => void;
      disabled?: boolean;
    }) => (
      <SelectContext.Provider value={{ onValueChange }}>
        <div data-disabled={disabled ? "true" : "false"}>{children}</div>
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

const mockAddFlow = jest.fn().mockResolvedValue(123);
const mockToastPromise = jest.fn((cb: () => Promise<unknown>) => cb());
const mockPush = jest.fn();

jest.mock("@/action/flow/add", () => ({
  addFlow: (...args: Parameters<typeof mockAddFlow>) => mockAddFlow(...args),
}));

jest.mock("sonner", () => ({
  toast: {
    promise: (...args: Parameters<typeof mockToastPromise>) =>
      mockToastPromise(...args),
  },
}));

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock("../ui/datetime-input", () => ({
  DateTimeInput: ({
    value,
    onChange,
  }: {
    value?: Date;
    onChange?: (value?: Date) => void;
  }) => (
    <input
      type="datetime-local"
      aria-label={value ? value.toISOString() : "datetime"}
      onChange={(event) => onChange?.(new Date(event.target.value))}
    />
  ),
}));

describe("AddFlow", () => {
  beforeEach(() => {
    mockAddFlow.mockClear();
    mockToastPromise.mockClear();
    mockPush.mockClear();
  });

  it("opens the dialog and submits the filled form", async () => {
    const user = userEvent.setup();

    render(<AddFlow />);

    await user.click(screen.getByRole("button", { name: "添加流程" }));
    await user.type(
      screen.getByPlaceholderText("填写展示的流程名称"),
      "2026 招新笔试",
    );
    await user.type(
      screen.getByPlaceholderText("填写展示的流程描述"),
      "第一阶段说明",
    );

    const inputs = screen.getAllByLabelText("datetime");
    await user.type(inputs[0], "2026-03-22T09:00");
    await user.type(inputs[1], "2026-03-22T18:00");
    await user.click(screen.getByRole("button", { name: "确认添加" }));

    await waitFor(() => {
      expect(mockToastPromise).toHaveBeenCalled();
      expect(mockAddFlow).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "2026 招新笔试",
          description: "第一阶段说明",
          startedAt: expect.any(Date),
          endedAt: expect.any(Date),
        }),
      );
      expect(mockPush).toHaveBeenCalledWith("/dashboard/flow/edit?id=123");
    });
  });

  it("creates a shared office flow with department groups instead of a round", async () => {
    const user = userEvent.setup();

    render(<AddFlow canChooseDepartment />);

    await user.click(screen.getByRole("button", { name: "添加流程" }));
    await user.type(
      screen.getByPlaceholderText("填写展示的流程名称"),
      "2026 办公类面试招新",
    );
    await user.type(
      screen.getByPlaceholderText("填写展示的流程描述"),
      "所有办公部门共用一条流程",
    );

    await user.click(
      screen.getByRole("button", { name: "办公类部门面试招新" }),
    );

    /* 空模型：不再有面试轮次，共享流程也没有归属部门 */
    expect(screen.queryByText("面试轮次")).not.toBeInTheDocument();
    expect(screen.queryByText("归属部门")).not.toBeInTheDocument();

    await user.type(
      screen.getByPlaceholderText(/每行一个办公部门/),
      "办公室\n科宣部",
    );
    const departmentOptionButtons = screen.getAllByRole("button", {
      name: "办公室",
    });
    /* 组别映射每个组别一个部门下拉，选项按钮按行依次出现 */
    await user.click(departmentOptionButtons[0]);
    await user.click(screen.getAllByRole("button", { name: "科宣部" })[1]);
    await user.type(screen.getByLabelText("面试时段"), "13:00-14:00");

    const inputs = screen.getAllByLabelText("datetime");
    await user.type(inputs[0], "2026-10-01T09:00");
    await user.type(inputs[1], "2026-10-01T18:00");
    await user.click(screen.getByRole("button", { name: "确认添加" }));

    await waitFor(() => {
      expect(mockAddFlow).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "office_interview",
          groupOptions: ["办公室", "科宣部"],
          groupDepartments: { 办公室: "office", 科宣部: "publicity" },
          slotOptions: [{ label: "13:00-14:00" }],
          department: null,
        }),
      );
    });
  });
});
