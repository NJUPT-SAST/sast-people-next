import * as React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { z } from "zod";

import { FlowEditor } from "./flowEditor";

const mockSaveFlowWorkspace = jest.fn().mockResolvedValue(undefined);

jest.mock("@/action/flow/save-workspace", () => ({
  saveFlowWorkspace: (...args: Parameters<typeof mockSaveFlowWorkspace>) =>
    mockSaveFlowWorkspace(...args),
}));

jest.mock("@/hooks/useFlowStepsInfoClient", () => ({
  useFlowStepsInfoClient: () => ({ data: undefined }),
}));

jest.mock("sonner", () => ({
  toast: {
    promise: (promiseOrFactory: unknown) =>
      typeof promiseOrFactory === "function"
        ? (promiseOrFactory as () => Promise<unknown>)()
        : promiseOrFactory,
  },
}));

jest.mock("@/components/ui/select", () => {
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

jest.mock("@/components/ui/datetime-input", () => ({
  DateTimeInput: ({ onChange }: { onChange?: (value?: Date | null) => void }) => (
    <input
      aria-label="datetime"
      onChange={(event) =>
        onChange?.(event.target.value ? new Date(event.target.value) : null)
      }
    />
  ),
}));

jest.mock("@/components/flow/add", () => {
  return {
    editFlowSchema: z.object({
      id: z.number().optional(),
      title: z.string(),
      description: z.string(),
      type: z.string().optional(),
      startedAt: z.date(),
      endedAt: z.date().nullable().optional(),
    }),
  };
});

const officeFlowData = {
  id: 21,
  title: "办公室面试招新",
  description: "办公类流程",
  type: "office_interview",
  department: "office",
  groupOptions: null,
  groupDepartments: null,
  slotOptions: [{ label: "13:00-14:00" }],
  startedAt: new Date("2026-10-01T01:00:00.000Z"),
  endedAt: new Date("2026-10-01T10:00:00.000Z"),
};

describe("FlowEditor", () => {
  beforeEach(() => {
    mockSaveFlowWorkspace.mockClear();
  });

  it("keeps the office interview steps when saving", async () => {
    const user = userEvent.setup();

    render(<FlowEditor data={officeFlowData as never} />);

    /* 办公类四步：报名 / 一面 / 二面 / 结果确认（order3 不再被覆盖成「管理员审核」） */
    expect(screen.getByDisplayValue("报名")).toBeInTheDocument();
    expect(screen.getByDisplayValue("一面")).toBeInTheDocument();
    expect(screen.getByDisplayValue("二面")).toBeInTheDocument();
    expect(screen.getByDisplayValue("结果确认")).toBeInTheDocument();
    expect(screen.queryByDisplayValue("管理员审核")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "保存全部更改" }));

    await waitFor(() => {
      expect(mockSaveFlowWorkspace).toHaveBeenCalledWith(
        expect.objectContaining({
          flowId: 21,
          steps: expect.arrayContaining([
            expect.objectContaining({ order: 3, title: "二面", type: "checking" }),
            expect.objectContaining({
              order: 4,
              title: "结果确认",
              type: "finished",
            }),
          ]),
        }),
      );
    });
  });

  it("switches the step template and department when an admin changes the type", async () => {
    const user = userEvent.setup();

    render(<FlowEditor data={officeFlowData as never} canChooseDepartment />);

    await user.click(screen.getByRole("button", { name: "软件研发部笔试" }));

    /* 笔试流程换成「报名 / 批卷 / 录取确认」模板，办公类的面试时段配置一并收起 */
    expect(screen.getByDisplayValue("批卷")).toBeInTheDocument();
    expect(screen.getByDisplayValue("录取确认")).toBeInTheDocument();
    expect(screen.queryByDisplayValue("结果确认")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("面试时段")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "保存全部更改" }));

    await waitFor(() => {
      expect(mockSaveFlowWorkspace).toHaveBeenCalledWith(
        expect.objectContaining({
          values: expect.objectContaining({
            type: "recruitment",
            department: "software",
          }),
        }),
      );
    });
  });
});
