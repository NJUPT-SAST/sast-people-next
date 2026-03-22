import { render, screen } from "@testing-library/react";

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

  it("falls back to the not-started copy when there is no current step", async () => {
    const ui = await FlowCard({
      flow: {
        id: 2,
        title: "未开始流程",
        status: "pending",
        currentStepOrder: 0,
        steps: [{ id: 1, order: 1, title: "报名", description: "待开启" }],
      } as never,
    });

    render(ui);

    expect(screen.getByText("当前步骤：（流程未开始）")).toBeInTheDocument();
    expect(screen.getByText("前面的区域以后再来探索吧")).toBeInTheDocument();
  });
});
