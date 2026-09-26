import * as React from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { EvaluationTable } from "./evaluationTable";
import {
  cancelInterviewSchedule,
  returnInterviewCandidate,
} from "@/action/user-flow/interviewSchedule";

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

// Radix menus need Popper/ResizeObserver plumbing that jsdom lacks, and this
// file already stubs the Radix Select for the same reason. Items render inline
// so the row-menu assertions can target them directly.
jest.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="row-menu">{children}</div>
  ),
  DropdownMenuItem: ({
    children,
    onSelect,
  }: {
    children: React.ReactNode;
    onSelect?: () => void;
  }) => (
    <button type="button" onClick={() => onSelect?.()}>
      {children}
    </button>
  ),
}));

type CandidateProps = React.ComponentProps<typeof EvaluationTable>["candidates"][number];

const SCHEDULE_MEETING_LINK = "https://example.com/meeting";

function makeCandidate(overrides: Partial<CandidateProps> = {}): CandidateProps {
  return {
    userFlowId: 1,
    uid: 1,
    name: "张三",
    studentId: "B001",
    qq: null,
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
    ...overrides,
  };
}

/** Booked but not finished, owned by the current user. */
function makeScheduledCandidate(overrides: Partial<CandidateProps> = {}) {
  return makeCandidate({
    scheduleId: 7,
    scheduleMeetingLink: SCHEDULE_MEETING_LINK,
    scheduleMeetingStatus: "scheduled",
    scheduleStartsAt: "2026-09-26T12:00:00+08:00",
    scheduleEndsAt: "2026-09-26T12:30:00+08:00",
    scheduleOrganizerName: "钱老师",
    ...overrides,
  });
}

/** Interview finished, no evaluation written yet. */
function makeEndedCandidate(overrides: Partial<CandidateProps> = {}) {
  return makeCandidate({
    scheduleId: 7,
    scheduleMeetingLink: SCHEDULE_MEETING_LINK,
    scheduleMeetingStatus: "ended",
    scheduleStartsAt: "2026-09-25T12:00:00+08:00",
    scheduleEndsAt: "2026-09-25T12:30:00+08:00",
    scheduleOrganizerName: "钱老师",
    ...overrides,
  });
}

function renderTable(
  candidates: CandidateProps[],
  props: Partial<React.ComponentProps<typeof EvaluationTable>> = {},
) {
  return render(
    <EvaluationTable
      role={3}
      groupOptions={[]}
      onRefresh={jest.fn()}
      candidates={candidates}
      {...props}
    />,
  );
}

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
    const unscheduledBadge = document.querySelector(
      '[data-slot="interview-status-badge"][data-status="unscheduled"]',
    );
    expect(unscheduledBadge).toHaveTextContent("待预约");
    expect(unscheduledBadge).toHaveClass(
      "text-slate-700",
      "dark:text-slate-300",
    );
    expect(screen.getAllByText("前端组").length).toBeGreaterThan(0);
    await user.click(screen.getAllByRole("button", { name: "退回" })[0]);
    await user.type(
      screen.getAllByRole("textbox", { name: /退回理由/, hidden: true }).at(-1)!,
      "测试退回理由",
    );
    await user.click(
      screen.getAllByRole("button", { name: "确认退回", hidden: true }).at(-1)!,
    );
    expect(returnInterviewCandidate).toHaveBeenCalledWith(42, "测试退回理由");

    // One primary action per row; the rest fold into the row menu.
    expect(screen.getAllByRole("button", { name: "预约" }).length).toBeGreaterThan(0);
    const rowMenu = within(screen.getAllByTestId("row-menu")[0]);
    expect(rowMenu.getByRole("button", { name: "退回" })).toBeInTheDocument();
    expect(rowMenu.queryByRole("button", { name: "预约" })).not.toBeInTheDocument();
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
    // Status chips carry the counts, so the numbers can be checked against the list.
    expect(screen.getByRole("button", { name: /^已退回/ })).toHaveTextContent("1");
    expect(screen.getByRole("button", { name: /^全部/ })).toHaveTextContent("1");
    expect(screen.queryAllByText("待预约")).toHaveLength(0);
    expect(screen.queryAllByRole("button", { name: "预约" })).toHaveLength(0);
    expect(screen.queryAllByRole("button", { name: "退回" })).toHaveLength(0);
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
    expect(
      screen.getAllByText("面评已提交，等待管理员终审").length,
    ).toBeGreaterThan(0);
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
  it("keeps the selected apply group when a refresh returns an equal group list", async () => {
    const user = userEvent.setup();
    const makeCandidate = (
      userFlowId: number,
      name: string,
      studentId: string,
      applyGroup: string,
    ) => ({
      userFlowId,
      uid: userFlowId,
      name,
      studentId,
      qq: null,
      status: "ongoing",
      withdrawReason: null,
      portfolioLink: null,
      portfolioDescription: null,
      applyGroup,
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
    });
    const candidates = [
      makeCandidate(1, "张三", "B001", "前端组"),
      makeCandidate(2, "李四", "B002", "后端组"),
    ];

    const { rerender } = render(
      <EvaluationTable
        role={2}
        groupOptions={["前端组", "后端组"]}
        onRefresh={jest.fn()}
        candidates={candidates}
      />,
    );

    await user.click(screen.getAllByRole("button", { name: "前端组" })[0]);
    expect(screen.queryAllByRole("button", { name: "李四" })).toHaveLength(0);

    // A server action's revalidatePath re-renders the server tree, so the parent
    // hands down a new array instance holding the same group values.
    rerender(
      <EvaluationTable
        role={2}
        groupOptions={["前端组", "后端组"]}
        onRefresh={jest.fn()}
        candidates={[...candidates]}
      />,
    );

    expect(screen.queryAllByRole("button", { name: "李四" })).toHaveLength(0);
    expect(
      screen.queryAllByRole("button", { name: "张三" }).length,
    ).toBeGreaterThan(0);
  });

  it("counts every candidate into exactly one status chip and filters on click", async () => {
    const user = userEvent.setup();
    renderTable([
      makeCandidate({ userFlowId: 1, name: "张三" }),
      makeScheduledCandidate({ userFlowId: 2, name: "李四" }),
      makeEndedCandidate({ userFlowId: 3, name: "王五" }),
    ]);

    expect(screen.getByRole("button", { name: /^全部/ })).toHaveTextContent("3");
    expect(screen.getByRole("button", { name: /^待预约/ })).toHaveTextContent("1");
    expect(screen.getByRole("button", { name: /^待面试/ })).toHaveTextContent("1");
    expect(screen.getByRole("button", { name: /^待评估/ })).toHaveTextContent("1");

    await user.click(screen.getByRole("button", { name: /^待预约/ }));

    expect(screen.queryAllByRole("button", { name: "李四" })).toHaveLength(0);
    expect(screen.queryAllByRole("button", { name: "王五" })).toHaveLength(0);
    expect(screen.getAllByRole("button", { name: "张三" }).length).toBeGreaterThan(0);
  });

  it("keeps chip counts stable while a status filter is active", async () => {
    const user = userEvent.setup();
    renderTable([
      makeCandidate({ userFlowId: 1, name: "张三" }),
      makeScheduledCandidate({ userFlowId: 2, name: "李四" }),
    ]);

    await user.click(screen.getByRole("button", { name: /^待预约/ }));

    // Counts describe the search scope, not the status filter, so selecting one
    // chip does not make every other chip read zero.
    expect(screen.getByRole("button", { name: /^全部/ })).toHaveTextContent("2");
    expect(screen.getByRole("button", { name: /^待预约/ })).toHaveTextContent("1");
    expect(screen.getByRole("button", { name: /^待面试/ })).toHaveTextContent("1");
    expect(screen.queryAllByRole("button", { name: "李四" })).toHaveLength(0);
  });

  it("searches across name, student id and QQ", async () => {
    const user = userEvent.setup();
    renderTable([
      makeCandidate({ userFlowId: 1, name: "张三", studentId: "B001", qq: "111" }),
      makeCandidate({ userFlowId: 2, name: "李四", studentId: "B002", qq: "222" }),
    ]);

    await user.type(screen.getByLabelText("搜索面试候选人"), "B002");

    expect(screen.queryAllByRole("button", { name: "张三" })).toHaveLength(0);
    expect(screen.getAllByRole("button", { name: "李四" }).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /^全部/ })).toHaveTextContent("1");
  });

  it("sorts the next interview first and pushes unbooked candidates last", () => {
    renderTable([
      makeScheduledCandidate({
        userFlowId: 3,
        name: "较晚",
        scheduleStartsAt: "2026-09-28T10:00:00+08:00",
      }),
      makeCandidate({ userFlowId: 1, name: "未预约", studentId: "B001" }),
      makeScheduledCandidate({
        userFlowId: 2,
        name: "较早",
        scheduleStartsAt: "2026-09-27T10:00:00+08:00",
      }),
    ]);

    const firstColumn = Array.from(
      document.querySelectorAll("table tbody tr td:first-child"),
    ).map((cell) => cell.textContent ?? "");

    expect(firstColumn[0]).toContain("较早");
    expect(firstColumn[1]).toContain("较晚");
    expect(firstColumn[2]).toContain("未预约");
  });

  it("distinguishes an empty flow from a filter that matched nothing", async () => {
    const user = userEvent.setup();
    const { unmount } = renderTable([]);

    expect(
      screen.getAllByText("该流程暂时没有可处理的报名人员。").length,
    ).toBeGreaterThan(0);
    unmount();

    renderTable([makeCandidate({ userFlowId: 1, name: "张三" })]);
    await user.type(screen.getByLabelText("搜索面试候选人"), "查无此人");

    expect(screen.getAllByText("没有符合条件的候选人。").length).toBeGreaterThan(0);
    expect(
      screen.queryAllByText("该流程暂时没有可处理的报名人员。"),
    ).toHaveLength(0);

    await user.click(screen.getAllByRole("button", { name: "清除筛选" })[0]);

    expect(screen.getAllByRole("button", { name: "张三" }).length).toBeGreaterThan(0);
  });

  it("offers a 待我处理 chip covering only rows this user can act on", async () => {
    const user = userEvent.setup();
    renderTable(
      [
        makeCandidate({ userFlowId: 1, name: "我的" }),
        makeScheduledCandidate({
          userFlowId: 2,
          name: "别人的",
          canManageSchedule: false,
          canEditEvaluation: false,
        }),
      ],
      { role: 2 },
    );

    // The locked row explains itself instead of showing an ownerless grey note.
    expect(
      screen.getAllByText("由 钱老师 预约，仅其本人可操作").length,
    ).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /^待我处理/ })).toHaveTextContent("1");

    await user.click(screen.getByRole("button", { name: /^待我处理/ }));

    expect(screen.queryAllByRole("button", { name: "别人的" })).toHaveLength(0);
    expect(screen.getAllByRole("button", { name: "我的" }).length).toBeGreaterThan(0);
  });

  it("confirms before cancelling a booking", async () => {
    const user = userEvent.setup();
    jest.mocked(cancelInterviewSchedule).mockResolvedValue({ success: true });
    renderTable([makeScheduledCandidate()]);

    // Dismissing the confirmation must leave the booking untouched.
    await user.click(screen.getAllByRole("button", { name: "取消预约" })[0]);
    expect(
      screen.getAllByRole("dialog", { hidden: true }).at(-1)!,
    ).toHaveTextContent("确认取消面试预约");
    await user.click(
      screen.getAllByRole("button", { name: "保留预约", hidden: true }).at(-1)!,
    );
    await waitFor(() => {
      expect(screen.queryAllByRole("dialog", { hidden: true })).toHaveLength(0);
    });
    expect(cancelInterviewSchedule).not.toHaveBeenCalled();

    await user.click(screen.getAllByRole("button", { name: "取消预约" })[0]);
    await user.click(
      screen
        .getAllByRole("button", { name: "确认取消预约", hidden: true })
        .at(-1)!,
    );
    await waitFor(() => {
      expect(cancelInterviewSchedule).toHaveBeenCalledWith(7);
    });
  });

  it("keeps the toolbar mounted and hides stale counts while loading", () => {
    renderTable([makeScheduledCandidate()], { loading: true });

    expect(screen.getByLabelText("搜索面试候选人")).toBeInTheDocument();
    // Rows and their counts belong to the previous flow until the load lands.
    expect(screen.queryAllByRole("button", { name: "张三" })).toHaveLength(0);
    expect(screen.queryByRole("button", { name: /^全部/ })).not.toBeInTheDocument();
  });

  it("paginates and reveals the page holding a deep-linked candidate", () => {
    const candidates = Array.from({ length: 30 }, (_, index) =>
      makeCandidate({
        userFlowId: index + 1,
        uid: index + 1,
        name: `候选人${index + 1}`,
        studentId: `B${String(index + 1).padStart(3, "0")}`,
      }),
    );

    renderTable(candidates, { targetUserFlowId: 28 });

    // 25 rows per page, so #28 would be hidden if the page were left at 1.
    expect(
      screen.getByRole("button", { name: "第 2 页" }),
    ).toHaveAttribute("aria-current", "page");
    expect(document.getElementById("user-flow-28-desktop")).toBeInTheDocument();
    expect(document.getElementById("user-flow-1-desktop")).not.toBeInTheDocument();
    expect(screen.getByText(/共 30 人/)).toBeInTheDocument();
  });
});
