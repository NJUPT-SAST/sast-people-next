import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { EvaluationTable } from "./evaluationTable";

jest.mock("@/action/user-flow/evaluation", () => ({
  createEvaluation: jest.fn(),
}));

jest.mock("@/action/user-flow/interviewSchedule", () => ({
  cancelInterviewSchedule: jest.fn(),
  confirmInterviewScheduleEnded: jest.fn(),
  createInterviewSchedule: jest.fn(),
  previewInterviewScheduleEmail: jest.fn(),
}));

jest.mock("@/components/feishu-oauth-status", () => ({
  FeishuOAuthStatus: () => null,
}));

jest.mock("sonner", () => ({
  toast: {
    error: jest.fn(),
    success: jest.fn(),
    warning: jest.fn(),
  },
}));

describe("EvaluationTable", () => {
  it("uses distinct target ids for desktop and mobile render paths", () => {
    render(
      <EvaluationTable
        role={3}
        targetUserFlowId={42}
        onRefresh={jest.fn()}
        candidates={[
          {
            userFlowId: 42,
            uid: 1,
            name: "张三",
            studentId: "B001",
            qq: "123456",
            status: "ongoing",
            portfolioLink: null,
            portfolioDescription: null,
            evalId: null,
            evalContent: null,
            evalMeetingLink: null,
            evalRecommendation: null,
            evalStatus: null,
            evalAuthorId: null,
            canEditEvaluation: true,
            canManageSchedule: true,
            scheduleId: null,
            scheduleOrganizerName: null,
            scheduleMeetingLink: null,
            scheduleLink: null,
            scheduleMeetingMinuteLink: null,
            scheduleLocation: null,
            scheduleMeetingRoomId: null,
            scheduleStartsAt: null,
            scheduleEndsAt: null,
            scheduleStatus: null,
            scheduleMeetingStatus: null,
            scheduleMeetingEndedAt: null,
          },
        ]}
      />,
    );

    expect(document.getElementById("user-flow-42-desktop")).toBeInTheDocument();
    expect(document.getElementById("user-flow-42-mobile")).toBeInTheDocument();
    expect(document.getElementById("user-flow-42")).not.toBeInTheDocument();
    expect(screen.getAllByText("待预约")[0]).toHaveClass(
      "text-sky-700",
      "dark:text-sky-300",
    );
    expect(screen.getAllByRole("button", { name: "预约" })[0]).toHaveClass(
      "text-foreground",
    );
  });

  it("requires evaluation content before submission", async () => {
    const user = userEvent.setup();
    render(
      <EvaluationTable
        role={2}
        onRefresh={jest.fn()}
        candidates={[{
          userFlowId: 1,
          uid: 1,
          name: "张三",
          studentId: "B001",
          qq: "123456",
          status: "ongoing",
          portfolioLink: null,
          portfolioDescription: null,
          evalId: null,
          evalContent: null,
          evalMeetingLink: null,
          evalRecommendation: null,
          evalStatus: null,
          evalAuthorId: null,
          canEditEvaluation: true,
          canManageSchedule: true,
          scheduleId: 1,
          scheduleOrganizerName: null,
          scheduleMeetingLink: "https://example.com/meeting",
          scheduleLink: null,
          scheduleMeetingMinuteLink: null,
          scheduleLocation: null,
          scheduleMeetingRoomId: null,
          scheduleStartsAt: "2026-08-06T08:00:00.000Z",
          scheduleEndsAt: "2026-08-06T08:30:00.000Z",
          scheduleStatus: "created",
          scheduleMeetingStatus: "ended",
          scheduleMeetingEndedAt: "2026-08-06T08:30:00.000Z",
        }]}
      />,
    );

    await user.click(screen.getAllByRole("button", { name: "填写面评" })[0]);
    await user.click(screen.getByRole("button", { name: "提交面评" }));

    expect(screen.getByRole("alert")).toHaveTextContent("请填写面评内容后再提交。");
  });

  it("hides schedule and pending evaluation edits from non-owners", () => {
    render(
      <EvaluationTable
        role={2}
        onRefresh={jest.fn()}
        candidates={[{
          userFlowId: 2,
          uid: 2,
          name: "李四",
          studentId: "B002",
          qq: null,
          status: "ongoing",
          portfolioLink: null,
          portfolioDescription: null,
          evalId: 9,
          evalContent: "已有面评",
          evalMeetingLink: null,
          evalRecommendation: "passed",
          evalStatus: "submitted",
          evalAuthorId: 8,
          canEditEvaluation: false,
          canManageSchedule: false,
          scheduleId: 3,
          scheduleOrganizerName: "钱老师",
          scheduleMeetingLink: "https://example.com/meeting",
          scheduleLink: null,
          scheduleMeetingMinuteLink: null,
          scheduleLocation: null,
          scheduleMeetingRoomId: null,
          scheduleStartsAt: null,
          scheduleEndsAt: null,
          scheduleStatus: "created",
          scheduleMeetingStatus: "ended",
          scheduleMeetingEndedAt: null,
        }]}
      />,
    );

    expect(screen.queryByRole("button", { name: "修改" })).not.toBeInTheDocument();
    expect(screen.getAllByText("预约讲师已提交面评").length).toBeGreaterThan(0);
  });

  it("opens portfolio link and description from the work button", async () => {
    const user = userEvent.setup();
    render(
      <EvaluationTable
        role={2}
        onRefresh={jest.fn()}
        candidates={[{
          userFlowId: 3,
          uid: 3,
          name: "王五",
          studentId: "B003",
          qq: null,
          status: "ongoing",
          portfolioLink: "https://example.com/project",
          portfolioDescription: "一个作品简介",
          evalId: null,
          evalContent: null,
          evalMeetingLink: null,
          evalRecommendation: null,
          evalStatus: null,
          evalAuthorId: null,
          canEditEvaluation: true,
          canManageSchedule: true,
          scheduleId: null,
          scheduleOrganizerName: null,
          scheduleMeetingLink: null,
          scheduleLink: null,
          scheduleMeetingMinuteLink: null,
          scheduleLocation: null,
          scheduleMeetingRoomId: null,
          scheduleStartsAt: null,
          scheduleEndsAt: null,
          scheduleStatus: null,
          scheduleMeetingStatus: null,
          scheduleMeetingEndedAt: null,
        }]}
      />,
    );

    await user.click(screen.getAllByRole("button", { name: "查看作品" })[0]);

    expect(screen.getByRole("dialog")).toHaveTextContent("一个作品简介");
    expect(screen.getByRole("dialog").querySelector('a[href="https://example.com/project"]'))
      .toBeInTheDocument();
  });
});
