import * as React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { z } from "zod";

import { EditSteps } from "./editSteps";

const mockUpdateFlow = jest.fn().mockResolvedValue(undefined);
const mockUpdateFlowStep = jest.fn().mockResolvedValue(undefined);
const mockBatchUpdate = jest.fn().mockResolvedValue(undefined);
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

jest.mock("@/hooks/useFlowStepsInfoClient", () => ({
  useFlowStepsInfoClient: () => ({
    data: stableStepsData,
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

jest.mock("@/action/user-flow/edit", () => ({
  batchUpdate: (...args: Parameters<typeof mockBatchUpdate>) =>
    mockBatchUpdate(...args),
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
    fullFlowSchema: z.object({
      id: z.number().optional(),
      title: z.string(),
      description: z.string(),
      startedAt: z.date(),
      endedAt: z.date(),
    }),
  };
});

describe("EditSteps", () => {
  beforeEach(() => {
    mockUpdateFlow.mockClear();
    mockUpdateFlowStep.mockClear();
    mockBatchUpdate.mockClear();
    mockToastPromise.mockClear();
  });

  it("saves flow metadata and edited steps", async () => {
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

    await user.click(screen.getByRole("button", { name: "添加步骤" }));
    await user.click(screen.getByRole("button", { name: "保存步骤" }));

    await waitFor(() => {
      expect(mockUpdateFlowStep).toHaveBeenCalledWith(
        5,
        expect.arrayContaining([
          expect.objectContaining({ title: "报名" }),
          expect.objectContaining({ type: "registering" }),
        ]),
      );
    });
  });

  it("triggers batch update for an individual step", async () => {
    const user = userEvent.setup();

    render(
      <EditSteps
        data={{
          id: 5,
          title: "招新流程",
          description: "旧描述",
          startedAt: new Date(),
          endedAt: new Date(),
        } as never}
      />,
    );

    const iconOnlyButton = screen
      .getAllByRole("button")
      .find((button) => button.textContent === "");

    expect(iconOnlyButton).toBeDefined();
    await user.click(iconOnlyButton!);

    await waitFor(() => {
      expect(mockBatchUpdate).toHaveBeenCalledWith(5, 1);
    });
  });
});
