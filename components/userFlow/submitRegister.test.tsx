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

  it("greys out a flow whose registration closed after the round-one confirmation", async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

    render(
      <SubmitRegister
        uid={7}
        flowList={[
          {
            id: 9,
            title: "办公室面试",
            type: "office_interview",
            startedAt: new Date("2026-03-21T08:00:00.000Z"),
            endedAt: new Date("2026-03-30T08:00:00.000Z"),
            registrationClosedAt: new Date("2026-03-22T07:00:00.000Z"),
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

    /* 确认一面后报名截止的流程置灰并标注原因；同一时间其他流程照常可选 */
    const closedOption = screen.getByRole("button", { name: /办公室面试/ });
    expect(closedOption).toBeDisabled();
    expect(closedOption).toHaveTextContent("报名已截止");
    expect(screen.getByRole("button", { name: /正在报名流程/ })).toBeEnabled();
  });

  it("disables the entry when the only flow closed its registration", () => {
    render(
      <SubmitRegister
        uid={7}
        flowList={[
          {
            id: 9,
            title: "办公室面试",
            type: "office_interview",
            startedAt: new Date("2026-03-21T08:00:00.000Z"),
            endedAt: new Date("2026-03-30T08:00:00.000Z"),
            registrationClosedAt: new Date("2026-03-22T07:00:00.000Z"),
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

    await user.click(screen.getByRole("button", { name: "前端组" }));
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

    await user.click(screen.getByRole("button", { name: "前端组" }));
    await user.type(screen.getAllByPlaceholderText("https://...")[0], "https://front.test");
    await user.click(screen.getByRole("button", { name: "还要投递其他组别" }));
    await user.click(screen.getAllByRole("button", { name: "后端组" })[1]);
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

  it("requires a volunteer type and submits it with the interview slot for office interview flows", async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

    render(
      <SubmitRegister
        uid={7}
        flowList={[
          {
            id: 9,
            title: "办公室面试",
            type: "office_interview",
            /* 每个办公部门一条流程：报名归属即流程归属部门 */
            department: "office",
            slotOptions: [
              { label: "13:00-14:00" },
              { label: "时间冲突，约面时间QQ群中另行通知", isConflict: true },
            ],
            startedAt: new Date("2026-03-21T08:00:00.000Z"),
            endedAt: new Date("2026-03-23T08:00:00.000Z"),
          },
        ] as never}
      />,
    );

    await user.click(screen.getByRole("button", { name: "提交报名" }));
    await user.click(screen.getByRole("button", { name: /办公室面试/i }));

    /* 办公类不再有投递组别，也不收集作品链接/作品简介 */
    expect(screen.queryByText("投递组别")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("作品链接")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("作品简介")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "确认报名" }));
    expect(screen.getByRole("alert")).toHaveTextContent("请选择志愿类型");
    expect(mockRegister).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "第一志愿" }));
    await user.click(screen.getByRole("button", { name: "确认报名" }));
    expect(screen.getByRole("alert")).toHaveTextContent("请选择面试时段");
    expect(mockRegister).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "13:00-14:00" }));
    await user.click(screen.getByRole("button", { name: "确认报名" }));

    await waitFor(() => {
      expect(mockRegister).toHaveBeenCalledWith(9, 7, [
        {
          choice: 1,
          slot: "13:00-14:00",
        },
      ]);
    });
  });

  it("submits the second volunteer type for office flows without configured slots", async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

    render(
      <SubmitRegister
        uid={7}
        flowList={[
          {
            id: 10,
            title: "科宣部面试",
            type: "office_interview",
            department: "publicity",
            startedAt: new Date("2026-03-21T08:00:00.000Z"),
            endedAt: new Date("2026-03-23T08:00:00.000Z"),
          },
        ] as never}
      />,
    );

    await user.click(screen.getByRole("button", { name: "提交报名" }));
    await user.click(screen.getByRole("button", { name: /科宣部面试/i }));

    /* 流程未配置时段时不要求选择时段 */
    expect(screen.queryByLabelText("面试时段")).not.toBeInTheDocument();
    expect(
      screen.queryByText("请先通过一轮面试，才能报名二轮面试"),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "第二志愿" }));
    await user.click(screen.getByRole("button", { name: "确认报名" }));

    await waitFor(() => {
      expect(mockRegister).toHaveBeenCalledWith(10, 7, [
        {
          choice: 2,
          slot: undefined,
        },
      ]);
    });
  });

  it("clears the draft when the dialog is closed", async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

    render(
      <SubmitRegister
        uid={7}
        flowList={[{
          id: 3,
          title: "免试流程",
          type: "recruitment_exemption",
          groupOptions: ["前端组", "后端组"],
          startedAt: new Date("2026-03-21T08:00:00.000Z"),
          endedAt: new Date("2026-03-23T08:00:00.000Z"),
        }] as never}
      />,
    );

    await user.click(screen.getByRole("button", { name: "提交报名" }));
    await user.click(screen.getByRole("button", { name: /免试流程/i }));
    await user.click(screen.getByRole("button", { name: "前端组" }));
    expect(screen.getAllByPlaceholderText("https://...").length).toBe(1);

    await user.click(screen.getByRole("button", { name: "Close" }));
    await user.click(screen.getByRole("button", { name: "提交报名" }));

    expect(screen.queryByPlaceholderText("https://...")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "确认报名" })).toBeDisabled();
  });
});
