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

  it("labels flow types with the session department", async () => {
    const user = userEvent.setup();

    render(<AddFlow department="media" />);

    await user.click(screen.getByRole("button", { name: "添加流程" }));

    expect(
      screen.getByRole("button", { name: "多媒体部笔试" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "多媒体部免试" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "多媒体部WOD" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "多媒体部SOD" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "WOC/WOD" }),
    ).not.toBeInTheDocument();
  });

  it("follows the department picked by the admin", async () => {
    const user = userEvent.setup();

    render(<AddFlow canChooseDepartment />);

    await user.click(screen.getByRole("button", { name: "添加流程" }));

    /* 未选归属部门时回落到通用名称 */
    expect(screen.getByRole("button", { name: "WOC" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "软件研发部WOC" }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "软件研发部" }));

    expect(
      screen.getByRole("button", { name: "软件研发部笔试" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "软件研发部WOC" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "WOC" }),
    ).not.toBeInTheDocument();
  });

  it("creates an office flow for a department with interview slots", async () => {
    const user = userEvent.setup();

    render(<AddFlow canChooseDepartment />);

    await user.click(screen.getByRole("button", { name: "添加流程" }));
    await user.type(
      screen.getByPlaceholderText("填写展示的流程名称"),
      "2026 办公类面试招新",
    );
    await user.type(
      screen.getByPlaceholderText("填写展示的流程描述"),
      "办公室面试招新",
    );

    await user.click(
      screen.getByRole("button", { name: "办公类部门面试招新" }),
    );

    /* 新模型：每个办公部门一条流程，不再有可投递的办公部门列表与映射 */
    expect(screen.queryByText("可投递的办公部门")).not.toBeInTheDocument();
    expect(screen.queryByText("办公部门 → 部门标识")).not.toBeInTheDocument();

    /* 归属部门与其它流程一致：管理员选择部门（办公类不提供“全局流程”） */
    expect(screen.queryByRole("button", { name: /全局流程/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "办公室" }));
    await user.type(screen.getByLabelText("面试时段"), "13:00-14:00");

    const inputs = screen.getAllByLabelText("datetime");
    await user.type(inputs[0], "2026-10-01T09:00");
    await user.type(inputs[1], "2026-10-01T18:00");
    await user.click(screen.getByRole("button", { name: "确认添加" }));

    await waitFor(() => {
      expect(mockAddFlow).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "office_interview",
          department: "office",
          slotOptions: [{ label: "13:00-14:00" }],
        }),
      );
    });
  });
});
