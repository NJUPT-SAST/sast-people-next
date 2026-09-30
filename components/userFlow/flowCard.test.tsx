import { render, screen } from "@testing-library/react";

jest.mock("./cancelRegistration", () => ({
  CancelRegistration: () => null,
}));

jest.mock("./portfolioLinkEditor", () => ({
  PortfolioLinkEditor: () => null,
}));

jest.mock("@/action/user-flow/interview-slot-change", () => ({
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

  it("shows the current stage, volunteer type, and interview slot for office interview flows", async () => {
    const ui = await FlowCard({
      flow: {
        id: 6,
        title: "办公室面试招新",
        status: "ongoing",
        flowType: "office_interview",
        round: 2,
        interviewSlot: "14:00-15:00",
        choice: 2,
        currentStepOrder: 1,
        steps: [{ id: 1, order: 1, title: "报名", description: "提交资料" }],
      } as never,
    });

    render(ui);

    expect(screen.getByText("当前阶段：二面")).toBeInTheDocument();
    expect(screen.getByText("面试时段：14:00-15:00")).toBeInTheDocument();
    expect(screen.getByText("志愿：第二志愿")).toBeInTheDocument();
  });

  it("labels a first-choice office registration", async () => {
    const ui = await FlowCard({
      flow: {
        id: 12,
        title: "办公室面试招新",
        status: "ongoing",
        flowType: "office_interview",
        round: 1,
        interviewSlot: "13:00-14:00",
        choice: 1,
        currentStepOrder: 1,
        steps: [{ id: 1, order: 1, title: "报名", description: "提交资料" }],
      } as never,
    });

    render(ui);

    expect(screen.getByText("志愿：第一志愿")).toBeInTheDocument();
    expect(screen.queryByText("志愿：第二志愿")).not.toBeInTheDocument();
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
        choice: 2,
        currentStepOrder: 1,
        steps: [{ id: 1, order: 1, title: "报名", description: "提交资料" }],
      } as never,
    });

    render(ui);

    expect(screen.queryByText("面试时段：14:00-15:00")).not.toBeInTheDocument();
    expect(screen.queryByText("志愿：第二志愿")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "申请修改面试时段" }),
    ).not.toBeInTheDocument();
  });

  it("tells office candidates to contact the department manager instead of offering a change request", async () => {
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
      screen.getByText("如需调整面试时段，请联系本部门部长"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "申请修改面试时段" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/改时段申请待审批/)).not.toBeInTheDocument();
  });

  it("shows the pending technical reschedule request instead of letting the candidate resubmit", async () => {
    const ui = await FlowCard({
      flow: {
        id: 9,
        title: "软研 WOC 面试",
        status: "ongoing",
        flowType: "woc",
        interviewSchedule: {
          id: 5,
          startsAt: new Date("2026-06-06T08:00:00.000Z"),
          endsAt: new Date("2026-06-06T08:30:00.000Z"),
          location: null,
        },
        pendingSlotChange: {
          id: 3,
          requestedStartsAt: new Date("2026-06-07T08:00:00.000Z"),
          requestedEndsAt: new Date("2026-06-07T08:30:00.000Z"),
        },
        currentStepOrder: 1,
        steps: [{ id: 1, order: 1, title: "报名", description: "提交资料" }],
      } as never,
    });

    render(ui);

    expect(
      screen.getByText("改约申请处理中：2026-06-07 16:00"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "申请修改面试时间" }),
    ).toBeDisabled();
  });

  it("shows the scheduled interview time and change entry for technical interview flows", async () => {
    const ui = await FlowCard({
      flow: {
        id: 11,
        title: "软研 WOC 面试",
        status: "ongoing",
        flowType: "woc",
        interviewSchedule: {
          id: 5,
          startsAt: new Date("2026-06-06T08:00:00.000Z"),
          endsAt: new Date("2026-06-06T08:30:00.000Z"),
          location: "大学生活动中心 101",
        },
        currentStepOrder: 1,
        steps: [{ id: 1, order: 1, title: "报名", description: "提交资料" }],
      } as never,
    });

    render(ui);

    expect(
      screen.getByText(/面试时间：2026-06-06 16:00 - 16:30/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "申请修改面试时间" }),
    ).toBeEnabled();
    expect(screen.queryByText("面试时段：14:00-15:00")).not.toBeInTheDocument();
  });
});
