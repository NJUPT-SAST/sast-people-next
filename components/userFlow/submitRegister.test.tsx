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

  it("disables unavailable flows and submits a single written-flow submission", async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

    render(
      <SubmitRegister
        uid={7}
        flowList={[
          {
            id: 1,
            title: "已结束流程",
            type: "recruitment",
            startedAt: new Date("2026-03-20T08:00:00.000Z"),
            endedAt: new Date("2026-03-21T08:00:00.000Z"),
          },
          {
            id: 2,
            title: "正在报名流程",
            type: "recruitment",
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
      expect(mockRegister).toHaveBeenCalledWith(2, 7, [
        { portfolioLink: undefined, portfolioDescription: undefined },
      ]);
      expect(mockToastPromise).toHaveBeenCalled();
    });
  });

  it("disables registration when there are no flows", () => {
    render(<SubmitRegister uid={7} flowList={[]} />);

    expect(screen.getByRole("button", { name: "提交报名" })).toBeDisabled();
  });

  it("disables registration when every flow is outside its registration window", () => {
    render(
      <SubmitRegister
        uid={7}
        flowList={[
          {
            id: 1,
            title: "已结束流程",
            type: "recruitment",
            startedAt: new Date("2026-03-20T08:00:00.000Z"),
            endedAt: new Date("2026-03-21T08:00:00.000Z"),
          },
          {
            id: 2,
            title: "尚未开始流程",
            type: "recruitment",
            startedAt: new Date("2026-03-23T08:00:00.000Z"),
            endedAt: new Date("2026-03-24T08:00:00.000Z"),
          },
        ] as never}
      />,
    );

    expect(screen.getByRole("button", { name: "暂无开放报名" })).toBeDisabled();
  });

  it("submits optional portfolio fields for ungrouped interview flows", async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

    render(
      <SubmitRegister
        uid={7}
        flowList={[
          {
            id: 3,
            title: "免试流程",
            type: "recruitment_exemption",
            startedAt: new Date("2026-03-21T08:00:00.000Z"),
            endedAt: new Date("2026-03-23T08:00:00.000Z"),
          },
        ] as never}
      />,
    );

    await user.click(screen.getByRole("button", { name: "提交报名" }));
    await user.click(screen.getByRole("button", { name: /免试流程/i }));
    await user.type(screen.getByLabelText("作品链接"), "https://demo.test");
    await user.type(screen.getByLabelText("作品简介"), "一个演示项目");
    await user.click(screen.getByRole("button", { name: "确认报名" }));

    await waitFor(() => {
      expect(mockRegister).toHaveBeenCalledWith(3, 7, [
        {
          portfolioLink: "https://demo.test",
          portfolioDescription: "一个演示项目",
        },
      ]);
    });
  });

  it("rejects an invalid portfolio URL before submitting", async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

    render(
      <SubmitRegister
        uid={7}
        flowList={[{
          id: 3,
          title: "免试流程",
          type: "recruitment_exemption",
          startedAt: new Date("2026-03-21T08:00:00.000Z"),
          endedAt: new Date("2026-03-23T08:00:00.000Z"),
        }] as never}
      />,
    );

    await user.click(screen.getByRole("button", { name: "提交报名" }));
    await user.click(screen.getByRole("button", { name: /免试流程/i }));
    await user.type(screen.getByLabelText("作品链接"), "not a url");
    await user.click(screen.getByRole("button", { name: "确认报名" }));

    expect(screen.getByRole("alert")).toHaveTextContent("作品链接格式不正确");
    expect(mockRegister).not.toHaveBeenCalled();
  });

  it("requires selecting at least one apply group with independent portfolio per group", async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

    render(
      <SubmitRegister
        uid={7}
        flowList={[
          {
            id: 3,
            title: "免试流程",
            type: "recruitment_exemption",
            groupOptions: ["前端组", "后端组"],
            startedAt: new Date("2026-03-21T08:00:00.000Z"),
            endedAt: new Date("2026-03-23T08:00:00.000Z"),
          },
        ] as never}
      />,
    );

    await user.click(screen.getByRole("button", { name: "提交报名" }));
    await user.click(screen.getByRole("button", { name: /免试流程/i }));

    await user.click(screen.getByRole("button", { name: "确认报名" }));

    expect(screen.getByRole("alert")).toHaveTextContent("请至少选择一个投递组别");
    expect(mockRegister).not.toHaveBeenCalled();

    await user.click(screen.getByRole("checkbox", { name: "前端组" }));
    expect(screen.getAllByPlaceholderText("https://...").length).toBe(1);
    await user.type(screen.getAllByPlaceholderText("https://...")[0], "https://a.test");
    await user.type(
      screen.getByPlaceholderText("简单介绍该项目内容、你的负责部分和使用技术"),
      "前端项目",
    );
    await user.click(screen.getByRole("button", { name: "确认报名" }));

    await waitFor(() => {
      expect(mockRegister).toHaveBeenCalledWith(3, 7, [
        {
          group: "前端组",
          portfolioLink: "https://a.test",
          portfolioDescription: "前端项目",
        },
      ]);
    });
  });

  it("submits one submission per selected group with its own portfolio", async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

    render(
      <SubmitRegister
        uid={7}
        flowList={[
          {
            id: 3,
            title: "免试流程",
            type: "recruitment_exemption",
            groupOptions: ["前端组", "后端组"],
            startedAt: new Date("2026-03-21T08:00:00.000Z"),
            endedAt: new Date("2026-03-23T08:00:00.000Z"),
          },
        ] as never}
      />,
    );

    await user.click(screen.getByRole("button", { name: "提交报名" }));
    await user.click(screen.getByRole("button", { name: /免试流程/i }));

    await user.click(screen.getByRole("checkbox", { name: "前端组" }));
    await user.type(screen.getAllByPlaceholderText("https://...")[0], "https://front.test");
    await user.click(screen.getByRole("checkbox", { name: "后端组" }));
    const inputs = screen.getAllByPlaceholderText("https://...");
    await user.type(inputs[1], "https://backend.test");
    await user.click(screen.getByRole("button", { name: "确认报名" }));

    await waitFor(() => {
      expect(mockRegister).toHaveBeenCalledWith(3, 7, [
        {
          group: "前端组",
          portfolioLink: "https://front.test",
          portfolioDescription: "",
        },
        {
          group: "后端组",
          portfolioLink: "https://backend.test",
          portfolioDescription: "",
        },
      ]);
    });
  });
});
