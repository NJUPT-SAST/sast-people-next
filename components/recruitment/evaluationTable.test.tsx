import * as React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { EvaluationTable } from "./evaluationTable";
import { returnInterviewCandidate } from "@/action/user-flow/interviewSchedule";

const mockUpdateCandidateApplyGroup = jest.fn();

jest.mock("@/action/user-flow/apply-group", () => ({
  updateCandidateApplyGroup: (...args: unknown[]) =>
    mockUpdateCandidateApplyGroup(...args),
}));

jest.mock("@/action/user-flow/evaluation", () => ({
  createEvaluation: jest.fn(),
}));

jest.mock("@/action/user-flow/interviewSchedule", () => ({
  cancelInterviewSchedule: jest.fn(),
  confirmInterviewScheduleEnded: jest.fn(),
  createInterviewSchedule: jest.fn(),
  previewInterviewScheduleEmail: jest.fn(),
  returnInterviewCandidate: jest.fn(),
}));

jest.mock("@/components/feishu-oauth-status", () => ({
  FeishuOAuthStatus: () => null,
}));
jest.mock("@/components/manage/viewUserInfoSheet", () => ({
  ViewUserInfoSheet: ({ trigger }: { trigger?: React.ReactNode }) => (
    <div>{trigger}</div>
  ),
}));

jest.mock("sonner", () => ({
  toast: {
    error: jest.fn(),
    success: jest.fn(),
    warning: jest.fn(),
  },
}));

jest.mock("@/components/ui/select", () => {
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
    }: {
      children: React.ReactNode;
      value: string;
    }) => {
      const { onValueChange } = React.useContext(SelectContext);
      return (
        <button type="button" onClick={() => onValueChange?.(value)}>
          {children}
        </button>
      );
    },
  };
});

describe("EvaluationTable", () => {
  it("requires a return reason before withdrawing a candidate", async () => {
    const user = userEvent.setup();
    jest.mocked(returnInterviewCandidate).mockResolvedValue({ success: true });
    render(
      <EvaluationTable
        role={3}
        groupOptions={[]}
        onRefresh={jest.fn()}
        candidates={[{
          userFlowId: 42,
          uid: 1,
          name: "张三",
          studentId: "B001",
          qq: "123456",
          status: "ongoing",
          withdrawReason: null,
          portfolioLink: null,
          portfolioDescription: null,
          applyGroup: null,
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

    await user.click(screen.getAllByRole("button", { name: "退回" })[0]);
    await user.click(
      screen.getAllByRole("button", { name: "确认退回", hidden: true }).at(-1)!,
    );
    expect(screen.getAllByRole("alert", { hidden: true }).at(-1)!).toHaveTextContent(
      "请填写退回理由",
    );
    expect(returnInterviewCandidate).not.toHaveBeenCalled();
  });

  it("passes the entered return reason to the action", async () => {
    const user = userEvent.setup();
    jest.mocked(returnInterviewCandidate).mockResolvedValue({ success: true });
    render(
      <EvaluationTable
        role={3}
        groupOptions={[]}
        onRefresh={jest.fn()}
        candidates={[{
          userFlowId: 42,
          uid: 1,
          name: "张三",
          studentId: "B001",
          qq: "123456",
          status: "ongoing",
          withdrawReason: null,
          portfolioLink: null,
          portfolioDescription: null,
          applyGroup: null,
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

    await user.click(screen.getAllByRole("button", { name: "退回" })[0]);
    await user.type(
      screen.getAllByRole("textbox", { name: /退回理由/, hidden: true }).at(-1)!,
      "面试安排调整",
    );
    await user.click(
      screen.getAllByRole("button", { name: "确认退回", hidden: true }).at(-1)!,
    );
    expect(returnInterviewCandidate).toHaveBeenCalledWith(42, "面试安排调整");
  });

  it("uses distinct target ids for desktop and mobile render paths", async () => {
    const user = userEvent.setup();
    jest.mocked(returnInterviewCandidate).mockResolvedValue({ success: true });
    render(
      <EvaluationTable
        role={3}
        targetUserFlowId={42}
        groupOptions={[]}
        onRefresh={jest.fn()}
        candidates={[
          {
            userFlowId: 42,
            uid: 1,
            name: "张三",
            studentId: "B001",
            qq: "123456",
            status: "ongoing",
            withdrawReason: null,
            portfolioLink: null,
            portfolioDescription: null,
            applyGroup: "前端组",
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
    expect(screen.getAllByText("待预约")[0]).toHaveClass(
      "text-sky-700",
      "dark:text-sky-300",
    );
    expect(screen.getAllByText("前端组").length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: "退回" }).length).toBeGreaterThan(0);
    await user.click(screen.getAllByRole("button", { name: "退回" })[0]);
    await user.type(
      screen.getAllByRole("textbox", { name: /退回理由/, hidden: true }).at(-1)!,
      "测试退回理由",
    );
    await user.click(
      screen.getAllByRole("button", { name: "确认退回", hidden: true }).at(-1)!,
    );
    expect(returnInterviewCandidate).toHaveBeenCalledWith(42, "测试退回理由");
    expect(screen.getAllByRole("button", { name: "预约" })[0]).toHaveClass(
      "text-foreground",
    );
  });

  it("shows withdrawn candidates as withdrawn instead of waiting", () => {
    render(
      <EvaluationTable
        role={3}
        groupOptions={[]}
        onRefresh={jest.fn()}
        candidates={[{
          userFlowId: 44,
          uid: 44,
          name: "周七",
          studentId: "B044",
          qq: null,
          status: "withdrawn",
          withdrawReason: "时间冲突",
          portfolioLink: null,
          portfolioDescription: null,
          applyGroup: null,
          evalId: null,
          evalContent: null,
          evalMeetingLink: null,
          evalRecommendation: null,
          evalStatus: null,
          evalAuthorId: null,
          canEditEvaluation: false,
          canManageSchedule: false,
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

    expect(screen.getAllByText("已退回").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/已退回 1/).length).toBeGreaterThan(0);
    expect(screen.queryAllByText("待预约")).toHaveLength(0);
  });

  it("does not return a candidate when the confirm dialog is cancelled", async () => {
    const user = userEvent.setup();
    render(
      <EvaluationTable
        role={3}
        groupOptions={[]}
        onRefresh={jest.fn()}
        candidates={[{
          userFlowId: 43,
          uid: 4,
          name: "赵六",
          studentId: "B004",
          qq: null,
          status: "ongoing",
          portfolioLink: null,
          portfolioDescription: null,
          applyGroup: null,
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

    await user.click(screen.getAllByRole("button", { name: "退回" })[0]);
    expect(screen.getAllByRole("dialog", { hidden: true }).at(-1)!).toHaveTextContent(
      "确认退回面试报名",
    );
    await user.click(screen.getAllByRole("button", { name: "取消", hidden: true }).at(-1)!);
    await waitFor(() => {
      expect(screen.queryAllByRole("dialog", { hidden: true })).toHaveLength(0);
    });
    expect(returnInterviewCandidate).not.toHaveBeenCalled();
  });

  it("requires evaluation content before submission", async () => {
    const user = userEvent.setup();
    render(
      <EvaluationTable
        role={2}
        groupOptions={[]}
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
          applyGroup: null,
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
        groupOptions={[]}
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
          applyGroup: null,
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
        groupOptions={[]}
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
          applyGroup: null,
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

  it("filters candidates by apply group", async () => {
    const user = userEvent.setup();

    render(
      <EvaluationTable
        role={2}
        groupOptions={["前端组", "后端组"]}
        onRefresh={jest.fn()}
        candidates={[
          {
            userFlowId: 21,
            uid: 21,
            name: "张三",
            studentId: "B021",
            qq: null,
            status: "ongoing",
            portfolioLink: null,
            portfolioDescription: null,
            applyGroup: "前端组",
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
          {
            userFlowId: 22,
            uid: 22,
            name: "李四",
            studentId: "B022",
            qq: null,
            status: "ongoing",
            portfolioLink: null,
            portfolioDescription: null,
            applyGroup: "后端组",
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

    expect(screen.getAllByText("前端组").length).toBeGreaterThan(0);
    expect(screen.getAllByText("后端组").length).toBeGreaterThan(0);

    await user.click(screen.getAllByRole("button", { name: "后端组" })[0]);
    expect(screen.getAllByRole("button", { name: "修改李四的投递组别" }).length).toBe(2);
    expect(
      screen.queryAllByRole("button", { name: "修改张三的投递组别" }).length,
    ).toBe(0);
    expect(screen.queryByText("该组别暂无候选人")).not.toBeInTheDocument();
  });

  it("lets roles 2+ mark or change a candidate's apply group", async () => {
    const user = userEvent.setup();
    const onRefresh = jest.fn();
    mockUpdateCandidateApplyGroup.mockReset().mockResolvedValue({ success: true });

    render(
      <EvaluationTable
        role={2}
        groupOptions={["前端组", "后端组"]}
        onRefresh={onRefresh}
        candidates={[{
          userFlowId: 4,
          uid: 4,
          name: "赵六",
          studentId: "B004",
          qq: null,
          status: "ongoing",
          portfolioLink: null,
          portfolioDescription: null,
          applyGroup: null,
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

    expect(screen.getAllByText("未填写").length).toBeGreaterThan(0);
    await user.click(screen.getAllByRole("button", { name: "修改赵六的投递组别" })[0]);

    expect(screen.getByRole("dialog")).toHaveTextContent("修改投递组别");

    await user.click(screen.getByRole("button", { name: "保存" }));
    expect(screen.getByRole("alert")).toHaveTextContent("请选择投递组别");
    expect(mockUpdateCandidateApplyGroup).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "后端组" }));
    await user.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => {
      expect(mockUpdateCandidateApplyGroup).toHaveBeenCalledWith(4, "后端组");
      expect(onRefresh).toHaveBeenCalled();
    });
  });
});
