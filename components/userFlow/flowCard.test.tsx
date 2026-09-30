import { render, screen } from "@testing-library/react";

jest.mock("./cancelRegistration", () => ({
  CancelRegistration: () => null,
}));

jest.mock("./portfolioLinkEditor", () => ({
  PortfolioLinkEditor: () => null,
}));

jest.mock("@/action/user-flow/office-interview", () => ({
  requestInterviewSlotChange: jest.fn(),
}));

jest.mock("sonner", () => ({
  toast: { success: jest.fn(), error: jest.fn() },
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

  it("shows the current stage, interview slot, and second choice for office interview flows", async () => {
    const ui = await FlowCard({
      flow: {
        id: 6,
        title: "办公室面试招新",
        status: "ongoing",
        flowType: "office_interview",
        round: 2,
        interviewSlot: "14:00-15:00",
        secondChoiceDepartment: "publicity",
        currentStepOrder: 1,
        steps: [{ id: 1, order: 1, title: "报名", description: "提交资料" }],
      } as never,
    });

    render(ui);

    expect(screen.getByText("当前阶段：二面")).toBeInTheDocument();
    expect(screen.getByText("面试时段：14:00-15:00")).toBeInTheDocument();
    expect(screen.getByText("第二志愿部门：科宣部")).toBeInTheDocument();
  });

  it("omits office interview details for other flow types", async () => {
    const ui = await FlowCard({
      flow: {
        id: 7,
        title: "免试流程",
        status: "ongoing",
        flowType: "recruitment_exemption",
        round: 1,
        interviewSlot: "14:00-15:00",
        secondChoiceDepartment: "publicity",
        currentStepOrder: 1,
        steps: [{ id: 1, order: 1, title: "报名", description: "提交资料" }],
      } as never,
    });

    render(ui);

    expect(screen.queryByText("面试时段：14:00-15:00")).not.toBeInTheDocument();
    expect(screen.queryByText("第二志愿部门：科宣部")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "申请修改面试时段" }),
    ).not.toBeInTheDocument();
  });

  it("offers a slot change while the office registration is still editable", async () => {
    const ui = await FlowCard({
      flow: {
        id: 8,
        title: "办公室面试招新",
        status: "ongoing",
        flowType: "office_interview",
        round: 1,
        interviewSlot: "13:00-14:00",
        slotOptions: [{ label: "13:00-14:00" }, { label: "15:00-16:00" }],
        currentStepOrder: 1,
        steps: [{ id: 1, order: 1, title: "报名", description: "提交资料" }],
      } as never,
    });

    render(ui);

    expect(
      screen.getByRole("button", { name: "申请修改面试时段" }),
    ).toBeEnabled();
    expect(screen.queryByText(/改时段申请待审批/)).not.toBeInTheDocument();
  });

  it("shows the pending slot change request instead of letting the candidate resubmit", async () => {
    const ui = await FlowCard({
      flow: {
        id: 9,
        title: "办公室面试招新",
        status: "ongoing",
        flowType: "office_interview",
        round: 1,
        interviewSlot: "13:00-14:00",
        slotOptions: [{ label: "13:00-14:00" }, { label: "15:00-16:00" }],
        pendingSlotChange: { id: 3, requestedSlot: "15:00-16:00" },
        currentStepOrder: 1,
        steps: [{ id: 1, order: 1, title: "报名", description: "提交资料" }],
      } as never,
    });

    render(ui);

    expect(
      screen.getByText("改时段申请待审批：15:00-16:00"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "申请修改面试时段" }),
    ).toBeDisabled();
  });

  it("hides the slot change entry once the office registration is finished", async () => {
    const ui = await FlowCard({
      flow: {
        id: 10,
        title: "办公室面试招新",
        status: "passed",
        publicationStatus: "published",
        flowType: "office_interview",
        round: 1,
        interviewSlot: "13:00-14:00",
        slotOptions: [{ label: "13:00-14:00" }, { label: "15:00-16:00" }],
        currentStepOrder: 1,
        steps: [{ id: 1, order: 1, title: "报名", description: "提交资料" }],
      } as never,
    });

    render(ui);

    expect(
      screen.queryByRole("button", { name: "申请修改面试时段" }),
    ).not.toBeInTheDocument();
  });
});
