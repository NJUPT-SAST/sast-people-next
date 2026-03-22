import * as React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import SubmitRegister from "./submitRegister";

const mockRegister = jest.fn();
const mockToastPromise = jest.fn((promise: Promise<unknown>) => promise);

jest.mock("@/action/user-flow/register", () => ({
  register: (...args: Parameters<typeof mockRegister>) => mockRegister(...args),
}));

jest.mock("sonner", () => ({
  toast: {
    promise: (...args: Parameters<typeof mockToastPromise>) =>
      mockToastPromise(...args),
  },
}));

jest.mock("@/lib/dayjs", () => {
  return (date?: Date) => ({
    format: () =>
      date instanceof Date ? `fmt:${date.toISOString()}` : "fmt:now",
  });
});

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

describe("SubmitRegister", () => {
  const now = new Date("2026-03-22T08:00:00.000Z");

  beforeEach(() => {
    mockRegister.mockReset().mockResolvedValue({ success: true });
    mockToastPromise.mockClear();
    jest.useFakeTimers().setSystemTime(now);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("disables unavailable flows and submits the selected active flow", async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

    render(
      <SubmitRegister
        uid={7}
        flowList={[
          {
            id: 1,
            title: "已结束流程",
            startedAt: new Date("2026-03-20T08:00:00.000Z"),
            endedAt: new Date("2026-03-21T08:00:00.000Z"),
          },
          {
            id: 2,
            title: "正在报名流程",
            startedAt: new Date("2026-03-21T08:00:00.000Z"),
            endedAt: new Date("2026-03-23T08:00:00.000Z"),
          },
        ] as never}
      />,
    );

    await user.click(screen.getByRole("button", { name: "提交报名" }));

    expect(screen.getByRole("button", { name: /已结束流程/i })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: /正在报名流程/i }));
    await user.click(screen.getByRole("button", { name: "确认报名" }));

    await waitFor(() => {
      expect(mockRegister).toHaveBeenCalledWith(2, 7);
      expect(mockToastPromise).toHaveBeenCalled();
    });
  });
});
