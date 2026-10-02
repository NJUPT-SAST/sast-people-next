import * as React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { z } from "zod";

import { EditSteps } from "./editSteps";

const mockUpdateFlow = jest.fn().mockResolvedValue(undefined);
const mockUpdateFlowStep = jest.fn().mockResolvedValue(undefined);
const mockToastPromise = jest.fn((promiseOrFactory: unknown) => {
  if (typeof promiseOrFactory === "function") {
    return (promiseOrFactory as () => Promise<unknown>)();
  }
  return promiseOrFactory;
});
const stableStepsData = [
  {
    id: 1,
    title: "报名",
    type: "registering",
    order: 1,
    description: "填写资料",
    createdAt: new Date(),
    updatedAt: new Date(),
    isDeleted: false,
    fkFlowId: 5,
  },
];

/* 已存步骤可按用例替换；默认就是上面那份报名步骤 */
let mockSavedSteps = stableStepsData;

jest.mock("@/hooks/useFlowStepsInfoClient", () => ({
  useFlowStepsInfoClient: () => ({
    data: mockSavedSteps,
  }),
}));

jest.mock("@/action/flow/update", () => ({
  updateFlow: (...args: Parameters<typeof mockUpdateFlow>) =>
    mockUpdateFlow(...args),
}));

jest.mock("@/action/flow/flow-step/update", () => ({
  updateFlowStep: (...args: Parameters<typeof mockUpdateFlowStep>) =>
    mockUpdateFlowStep(...args),
}));

jest.mock("sonner", () => ({
  toast: {
    promise: (...args: Parameters<typeof mockToastPromise>) =>
      mockToastPromise(...args),
  },
}));

jest.mock("@/components/ui/sheet", () => ({
  Sheet: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SheetTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SheetContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SheetHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SheetFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SheetTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SheetDescription: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
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

jest.mock("@/components/ui/datetime-input", () => ({
  DateTimeInput: ({
    onChange,
  }: {
    onChange?: (value?: Date) => void;
  }) => (
    <input
      aria-label="datetime"
      onChange={(event) => onChange?.(new Date(event.target.value))}
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

describe("EditSteps", () => {
  beforeEach(() => {
    mockUpdateFlow.mockClear();
    mockUpdateFlowStep.mockClear();
    mockToastPromise.mockClear();
    mockSavedSteps = stableStepsData;
  });

  it("saves flow metadata and edited step labels", async () => {
    const user = userEvent.setup();

    render(
      <EditSteps
        data={{
          id: 5,
          title: "招新流程",
          description: "旧描述",
          startedAt: new Date("2026-03-22T08:00:00.000Z"),
          endedAt: new Date("2026-03-22T18:00:00.000Z"),
        } as never}
      />,
    );

    await user.clear(screen.getByPlaceholderText("填写展示的流程描述"));
    await user.type(screen.getByPlaceholderText("填写展示的流程描述"), "新描述");
    await user.click(screen.getByRole("button", { name: "保存流程信息" }));

    await waitFor(() => {
      expect(mockUpdateFlow).toHaveBeenCalledWith(
        5,
        expect.objectContaining({ description: "新描述" }),
      );
    });

    expect(screen.queryByRole("button", { name: "添加步骤" })).not.toBeInTheDocument();
    const registerTitleInput = screen.getByDisplayValue("报名");
    const registerDescriptionInput = screen.getByDisplayValue("填写资料");
    await user.clear(registerTitleInput);
    await user.type(registerTitleInput, "线上报名");
    await user.clear(registerDescriptionInput);
    await user.type(registerDescriptionInput, "填写基础资料");
    expect(screen.getByDisplayValue("批卷")).not.toBeDisabled();
    expect(screen.getByDisplayValue("录取确认")).not.toBeDisabled();

    await user.click(screen.getByRole("button", { name: "保存步骤" }));

    await waitFor(() => {
      expect(mockUpdateFlowStep).toHaveBeenCalledWith(
        5,
        expect.arrayContaining([
          expect.objectContaining({
            title: "线上报名",
            type: "registering",
            order: 1,
            description: "填写基础资料",
          }),
          expect.objectContaining({
            title: "批卷",
            type: "judging",
            order: 2,
          }),
          expect.objectContaining({
            title: "录取确认",
            type: "finished",
            order: 3,
          }),
        ]),
      );
    });
  });

  it("lets an admin change the flow type and submits the paired department", async () => {
    const user = userEvent.setup();

    render(
      <EditSteps
        canChooseDepartment
        data={{
          id: 9,
          title: "软件研发部笔试招新",
          description: "部门流程",
          type: "recruitment",
          department: "software",
          startedAt: new Date("2026-03-22T08:00:00.000Z"),
          endedAt: new Date("2026-03-22T18:00:00.000Z"),
        } as never}
      />,
    );

    /* 编辑态当前组合按语义化标签展示（软件研发部笔试） */
    expect(screen.getByText("软件研发部笔试")).toBeInTheDocument();

    /* 换成「办公室面试」：type 与 department 一起变 */
    await user.click(screen.getByRole("button", { name: "办公室面试" }));
    await user.click(screen.getByRole("button", { name: "保存流程信息" }));

    await waitFor(() => {
      expect(mockUpdateFlow).toHaveBeenCalledWith(
        9,
        expect.objectContaining({
          type: "office_interview",
          department: "office",
        }),
      );
    });
  });

  it("saves an office flow's owning department and slots without group mapping", async () => {
    const user = userEvent.setup();

    render(
      <EditSteps
        data={{
          id: 7,
          title: "办公类部门面试招新",
          description: "办公室面试",
          type: "office_interview",
          department: "office",
          slotOptions: [{ label: "13:00-14:00" }],
          startedAt: new Date("2026-03-22T08:00:00.000Z"),
          endedAt: new Date("2026-03-22T18:00:00.000Z"),
        } as never}
      />,
    );

    /* 新模型：办公类流程按归属部门隔离，不再有可投递部门与映射配置 */
    expect(screen.queryByText("投递组别选项")).not.toBeInTheDocument();
    expect(screen.queryByText("组别 → 部门")).not.toBeInTheDocument();
    expect(screen.getByText("归属部门")).toBeInTheDocument();
    expect(screen.getByText("办公室")).toBeInTheDocument();
    expect(screen.getByLabelText("面试时段")).toHaveValue("13:00-14:00");

    await user.click(screen.getByRole("button", { name: "保存流程信息" }));

    await waitFor(() => {
      expect(mockUpdateFlow).toHaveBeenCalledWith(
        7,
        expect.objectContaining({
          department: "office",
          slotOptions: [{ label: "13:00-14:00" }],
        }),
      );
    });
  });

  it("drops the previous type's step text after the flow type changes", async () => {
    const user = userEvent.setup();
    /* 已存的办公类步骤：order 2 是 checking「一面」，与免试模板的 order 2 撞型 */
    mockSavedSteps = [
      {
        id: 11,
        title: "报名",
        type: "registering",
        order: 1,
        description: "填写个人信息",
        createdAt: new Date(),
        updatedAt: new Date(),
        isDeleted: false,
        fkFlowId: 31,
      },
      {
        id: 12,
        title: "一面",
        type: "checking",
        order: 2,
        description: "部门部长进行一对一面试并打分",
        createdAt: new Date(),
        updatedAt: new Date(),
        isDeleted: false,
        fkFlowId: 31,
      },
    ];

    render(
      <EditSteps
        canChooseDepartment
        data={{
          id: 31,
          title: "办公室面试招新",
          description: "办公类流程",
          type: "office_interview",
          department: "office",
          startedAt: new Date("2026-03-22T08:00:00.000Z"),
          endedAt: new Date("2026-03-22T18:00:00.000Z"),
        } as never}
      />,
    );

    expect(screen.getByDisplayValue("一面")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "软件研发部免试" }));

    /* 免试模板的 order 2 是「讲师审核」，不能被旧类型的「一面」覆盖 */
    expect(screen.queryByDisplayValue("一面")).not.toBeInTheDocument();
    expect(screen.getByDisplayValue("讲师审核")).toBeInTheDocument();
    expect(
      screen.queryByDisplayValue("部门部长进行一对一面试并打分"),
    ).not.toBeInTheDocument();
  });
});
