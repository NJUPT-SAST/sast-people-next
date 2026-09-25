import { render, screen } from "@testing-library/react";

jest.mock("./cancelRegistration", () => ({
  CancelRegistration: () => null,
}));

jest.mock("./portfolioLinkEditor", () => ({
  PortfolioLinkEditor: () => null,
}));

import { FlowCard } from "./flowCard";

describe("FlowCard", () => {
  it("renders the current status, steps, and current step summary", async () => {
    const ui = await FlowCard({
      flow: {
        id: 1,
        title: "春招流程",
        status: "ongoing",
        currentStepOrder: 2,
        steps: [
          { id: 1, order: 1, title: "报名", description: "提交资料" },
          { id: 2, order: 2, title: "审核", description: "等待审核" },
          { id: 3, order: 3, title: "终试", description: "现场面试" },
        ],
      } as never,
    });

    render(ui);

    expect(screen.getByText("春招流程")).toBeInTheDocument();
    expect(screen.getByText("流程进行中")).toBeInTheDocument();
    expect(screen.getByText("当前步骤：审核")).toBeInTheDocument();
    expect(screen.getByText("等待审核")).toBeInTheDocument();
  });

  it("falls back to the first step when persisted current step is invalid", async () => {
    const ui = await FlowCard({
      flow: {
        id: 2,
        title: "未开始流程",
        status: "not_started",
        currentStepOrder: 0,
        steps: [{ id: 1, order: 1, title: "报名", description: "待开启" }],
      } as never,
    });

    render(ui);

    expect(screen.getByText("当前步骤：报名")).toBeInTheDocument();
    expect(screen.getByText("待开启")).toBeInTheDocument();
  });

  it("explains that a withdrawn interview can be registered again", async () => {
    const ui = await FlowCard({
      flow: {
        id: 3,
        title: "SOC 面试",
        status: "withdrawn",
        currentStepOrder: 1,
        steps: [{ id: 1, order: 1, title: "报名", description: "重新选择流程" }],
      } as never,
    });

    render(ui);

    expect(screen.getByText("已退回，请重新报名")).toBeInTheDocument();
  });

  it("does not show a final result before the flow result is published", async () => {
    const ui = await FlowCard({
      flow: {
        id: 4,
        title: "待发布流程",
        status: "passed",
        publicationStatus: "failed",
        currentStepOrder: 3,
        steps: [
          { id: 1, order: 1, title: "报名", description: "已完成" },
          { id: 2, order: 2, title: "笔试", description: "已完成" },
          { id: 3, order: 3, title: "结果确认", description: "等待确认" },
        ],
      } as never,
    });

    render(ui);

    expect(screen.getByText("流程进行中")).not.toHaveClass("sr-only");
    expect(screen.getByRole("button", { name: "结果确认，进行中。点击查看详情" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "结果确认，已通过。点击查看详情" })).not.toBeInTheDocument();
  });

  it("shows the final result after the flow result is published", async () => {
    const ui = await FlowCard({
      flow: {
        id: 5,
        title: "已发布流程",
        status: "passed",
        publicationStatus: "published",
        currentStepOrder: 3,
        steps: [{ id: 1, order: 3, title: "结果确认", description: "已通过" }],
      } as never,
    });

    render(ui);

    expect(screen.getByText("已通过考核")).not.toHaveClass("sr-only");
    expect(screen.getByRole("button", { name: "结果确认，已通过。点击查看详情" })).toBeInTheDocument();
  });

});
