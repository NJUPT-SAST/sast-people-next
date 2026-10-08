import * as React from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { EvaluationTable } from "./evaluationTable";
import {
  cancelInterviewSchedule,
  returnInterviewCandidate,
} from "@/action/user-flow/interviewSchedule";

const mockUpdateCandidateApplyGroup = jest.fn();
const mockUpdateCandidateInterviewSlot = jest.fn();

jest.mock("@/action/user-flow/apply-group", () => ({
  updateCandidateApplyGroup: (...args: unknown[]) =>
    mockUpdateCandidateApplyGroup(...args),
}));

jest.mock("@/action/user-flow/interview-slot", () => ({
  updateCandidateInterviewSlot: (...args: unknown[]) =>
    mockUpdateCandidateInterviewSlot(...args),
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
    SelectTrigger: ({
      children,
      ...props
    }: React.ComponentProps<"div">) => <div {...props}>{children}</div>,
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
  DropdownMenuSeparator: () => <hr data-testid="row-menu-separator" />,
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
      flowId={1}
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
        flowId={1}
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
        flowId={1}
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
        flowId={1}
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
    // One pill shape for every status, no leading dot, hue from the tint table.
    expect(unscheduledBadge).toHaveClass("bg-slate-500/10", "text-slate-800");
    expect(unscheduledBadge?.querySelector("span")).toBeNull();
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

    // One control per row, named after the next step, holding every action.
    const rowMenu = within(screen.getAllByTestId("row-menu")[0]);
    expect(rowMenu.getByRole("button", { name: "预约" })).toBeInTheDocument();
    expect(rowMenu.getByRole("button", { name: "退回" })).toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: "预约" }).length,
    ).toBeGreaterThan(1);
  });

  it("shows withdrawn candidates as withdrawn instead of waiting", () => {
    render(
      <EvaluationTable
        flowId={1}
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
        flowId={1}
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
        flowId={1}
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

    // Actions live in the row menu; the trigger only names the next step.
    const rowMenu = within(screen.getAllByTestId("row-menu")[0]);
    await user.click(rowMenu.getByRole("button", { name: "填写面评" }));
    await user.click(screen.getByRole("button", { name: "提交面评" }));

    expect(screen.getByRole("alert")).toHaveTextContent("请填写面评内容后再提交。");
  });

  it("requires a score and defaults the office opinion to 不填", async () => {
    const user = userEvent.setup();
    // jest.requireMock types the module as unknown; the mock factory above pins this shape.
    const evaluationActionMock = jest.requireMock(
      "@/action/user-flow/evaluation",
    ) as { createEvaluation: jest.Mock };
    const mockCreateEvaluation = evaluationActionMock.createEvaluation;
    mockCreateEvaluation
      .mockReset()
      .mockResolvedValue({ success: true, data: { id: 11 } });
    const mockToastSuccess = jest.requireMock("sonner").toast.success as jest.Mock;
    mockToastSuccess.mockReset();

    renderTable(
      [
        makeCandidate({
          userFlowId: 1,
          name: "甲同学",
          evaluations: [
            {
              id: 11,
              score: 80,
              content: "原面试记录",
              recommendation: null,
              status: "submitted",
              authorId: 2,
              authorName: "甲部长",
              isMine: true,
            },
          ],
          averageScore: 80,
          evaluationCount: 1,
        }),
      ],
      { scoringEnabled: true },
    );

    const rowMenu = within(screen.getAllByTestId("row-menu")[0]);
    await user.click(rowMenu.getByRole("button", { name: "修改记录" }));

    // 编辑的是本人那一份：分数与记录内容回填
    expect(screen.getByLabelText(/面试分数/)).toHaveValue(80);
    expect(screen.getByLabelText(/面试记录内容/)).toHaveValue("原面试记录");
    // 办公类弹窗没有讲师建议组，也没有妙记/作品区块；只有可选的面试意见
    expect(screen.queryByRole("group", { name: /讲师建议/ })).not.toBeInTheDocument();
    expect(screen.queryByText("妙记链接")).not.toBeInTheDocument();
    expect(screen.getByLabelText("面试意见（参考）")).toBeInTheDocument();

    await user.clear(screen.getByLabelText(/面试分数/));
    const contentBox = screen.getByLabelText(/面试记录内容/);
    await user.clear(contentBox);
    await user.type(contentBox, "表达清晰。");
    await user.click(screen.getByRole("button", { name: "保存记录" }));

    expect(screen.getByRole("alert")).toHaveTextContent("请填写 0-100 的面试分数");
    expect(mockCreateEvaluation).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText(/面试分数/), "88");
    await user.click(screen.getByRole("button", { name: "保存记录" }));

    // 本人那份意见为 null：办公类默认不填，第 3 个参数传 null，且不带妙记/会议链接
    expect(mockCreateEvaluation).toHaveBeenCalledWith(1, "表达清晰。", null, undefined, 88);
    expect(mockToastSuccess).toHaveBeenCalledWith("面试记录已保存");
  });

  it("hides schedule and pending evaluation edits from non-owners", () => {
    render(
      <EvaluationTable
        flowId={1}
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
    // No restated status text, but the block is explained: the badge cannot say
    // who owns the row.
    expect(
      screen.queryByText("面评已提交，等待管理员终审"),
    ).not.toBeInTheDocument();
    expect(
      screen.getAllByText("由 钱老师 预约，仅其本人可操作").length,
    ).toBeGreaterThan(0);
    expect(
      document.querySelector(
        '[data-slot="interview-status-badge"][data-status="pending"]',
      ),
    ).toBeInTheDocument();
  });

  it("opens portfolio link and description from the work button", async () => {
    const user = userEvent.setup();
    render(
      <EvaluationTable
        flowId={1}
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
        flowId={1}
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
        flowId={1}
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
        flowId={1}
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
        flowId={1}
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

  it("shows the applied department only when the flow does not already imply it", () => {
    const candidate = () =>
      makeCandidate({ userFlowId: 1, name: "张三", department: "software" });

    const { unmount } = renderTable([candidate()], { showDepartment: true });
    expect(screen.getAllByTitle("投递部门").length).toBeGreaterThan(0);
    expect(screen.getAllByText("软件研发部").length).toBeGreaterThan(0);
    unmount();

    renderTable([candidate()], { showDepartment: false });
    expect(screen.queryByTitle("投递部门")).not.toBeInTheDocument();
    expect(screen.queryByText("软件研发部")).not.toBeInTheDocument();
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

  it("hides the 待我处理 chip from roles that cannot act on rows", () => {
    renderTable(
      [makeCandidate({ userFlowId: 1, name: "未预约同学" })],
      { role: 1 },
    );

    // The action column only exists for role >= 2, so the chip must not
    // advertise rows this user has no way to act on.
    expect(screen.queryByRole("button", { name: /^待我处理/ })).toBeNull();
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

  it("collapses a same-day interview slot to a single date", () => {
    renderTable([makeScheduledCandidate()]);

    // 12:00–12:30 on the same Beijing day: repeating the date is noise.
    expect(
      screen.getAllByText("09-26 12:00 – 12:30").length,
    ).toBeGreaterThan(0);
  });

  it("keeps both dates when a slot crosses midnight", () => {
    renderTable([
      makeScheduledCandidate({ scheduleEndsAt: "2026-09-27T00:30:00+08:00" }),
    ]);

    expect(
      screen.getAllByText("09-26 12:00 – 09-27 00:30").length,
    ).toBeGreaterThan(0);
  });

  it("sorts from the column headers and keeps unbooked candidates last", async () => {
    const user = userEvent.setup();
    renderTable([
      makeScheduledCandidate({
        userFlowId: 1,
        name: "较早",
        studentId: "B001",
        scheduleStartsAt: "2026-09-27T10:00:00+08:00",
      }),
      makeCandidate({ userFlowId: 2, name: "未预约", studentId: "B002" }),
      makeScheduledCandidate({
        userFlowId: 3,
        name: "较晚",
        studentId: "B003",
        scheduleStartsAt: "2026-09-28T10:00:00+08:00",
      }),
    ]);

    const firstColumn = () =>
      Array.from(document.querySelectorAll("table tbody tr td:first-child")).map(
        (cell) => cell.textContent ?? "",
      );

    const scheduleHead = screen.getByRole("button", { name: "面试安排" });
    expect(scheduleHead.closest("th")).toHaveAttribute("aria-sort", "ascending");
    expect(firstColumn()[0]).toContain("较早");

    await user.click(scheduleHead);

    expect(scheduleHead.closest("th")).toHaveAttribute("aria-sort", "descending");
    expect(firstColumn()[0]).toContain("较晚");
    // Descending must not float a slotless candidate to the top.
    expect(firstColumn()[2]).toContain("未预约");
    expect(screen.getByRole("button", { name: "候选人" }).closest("th")).toHaveAttribute(
      "aria-sort",
      "none",
    );
  });

  it("sorts by name when the candidate header is clicked", async () => {
    const user = userEvent.setup();
    renderTable([
      makeCandidate({ userFlowId: 1, name: "赵六", studentId: "B001" }),
      makeCandidate({ userFlowId: 2, name: "阿七", studentId: "B002" }),
    ]);

    await user.click(screen.getByRole("button", { name: "候选人" }));

    const firstColumn = Array.from(
      document.querySelectorAll("table tbody tr td:first-child"),
    ).map((cell) => cell.textContent ?? "");
    expect(firstColumn[0]).toContain("阿七");
    expect(firstColumn[1]).toContain("赵六");
  });

  it("names the organiser on every row so the column stays even", () => {
    renderTable([
      makeScheduledCandidate({ userFlowId: 1, name: "甲" }),
      makeScheduledCandidate({ userFlowId: 2, name: "乙" }),
      makeScheduledCandidate({
        userFlowId: 3,
        name: "丙",
        scheduleOrganizerName: "孙老师",
      }),
    ]);

    // Suppressing the repeat made the schedule cell two lines on one row and one
    // line on the next, which read as a ragged column.
    const rows = Array.from(document.querySelectorAll("table tbody tr"));
    expect(rows[0].textContent).toContain("钱老师");
    expect(rows[1].textContent).toContain("钱老师");
    expect(rows[2].textContent).toContain("孙老师");
  });

  it("renders every match instead of paging through them", () => {
    const candidates = Array.from({ length: 30 }, (_, index) =>
      makeCandidate({
        userFlowId: index + 1,
        uid: index + 1,
        name: `候选人${index + 1}`,
        studentId: `B${String(index + 1).padStart(3, "0")}`,
      }),
    );

    renderTable(candidates, { targetUserFlowId: 28 });

    expect(document.querySelectorAll("table tbody tr")).toHaveLength(30);
    expect(document.querySelectorAll("[data-slot=candidate-card]")).toHaveLength(30);
    // The deep-linked row is still marked, but nothing is hidden behind a page.
    expect(document.getElementById("user-flow-28-desktop")).toBeInTheDocument();
    expect(screen.getAllByText("候选人30").length).toBeGreaterThan(0);
    // No numbered pager.
    expect(screen.queryByRole("button", { name: /第 \d+ 页/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "下一页" })).not.toBeInTheDocument();
  });

  it("shows the office score column with the average and reviewer count", () => {
    renderTable(
      [
        makeCandidate({
          userFlowId: 1,
          name: "甲同学",
          interviewSlot: "10:00-11:00",
          averageScore: 90,
          evaluationCount: 2,
          evaluations: [
            {
              id: 11,
              score: 80,
              content: "甲部长的面评",
              recommendation: "passed",
              status: "submitted",
              authorId: 2,
              authorName: "甲部长",
              round: 1,
              isMine: true,
            },
            {
              id: 12,
              score: 100,
              content: "乙部长的面评",
              recommendation: "passed",
              status: "submitted",
              authorId: 3,
              authorName: "乙部长",
              round: 2,
              isMine: false,
            },
          ],
        }),
      ],
      { scoringEnabled: true },
    );

    expect(screen.getByText("分数")).toBeInTheDocument();
    expect(screen.getByText("面试时段")).toBeInTheDocument();
    expect(screen.getAllByText("10:00-11:00").length).toBeGreaterThan(0);
    expect(screen.getAllByText("90").length).toBeGreaterThan(0);
    expect(screen.getAllByText("(2)").length).toBeGreaterThan(0);
    // 办公类面试不排日程，行上不能出现改约入口。
    expect(screen.queryByText("改约")).not.toBeInTheDocument();
  });

  it("labels each evaluation's stage in the score popover", async () => {
    const user = userEvent.setup();

    renderTable(
      [
        makeCandidate({
          userFlowId: 1,
          name: "甲同学",
          averageScore: 90,
          evaluationCount: 2,
          evaluations: [
            {
              id: 11,
              score: 80,
              content: "甲部长的面评",
              recommendation: "passed",
              status: "submitted",
              authorId: 2,
              authorName: "甲部长",
              round: 1,
              isMine: true,
            },
            {
              id: 12,
              score: 100,
              content: "乙部长的面评",
              recommendation: "passed",
              status: "submitted",
              authorId: 3,
              authorName: "乙部长",
              round: 2,
              isMine: false,
            },
          ],
        }),
      ],
      { scoringEnabled: true },
    );

    await user.click(
      screen.getAllByRole("button", { name: "查看甲同学当前阶段的全部面评" })[0],
    );

    expect(
      await screen.findByText("当前阶段面评 · 2 份打分"),
    ).toBeInTheDocument();
    /* 面评按阶段区分：一面 / 二面 */
    expect(screen.getAllByText("一面").length).toBeGreaterThan(0);
    expect(screen.getAllByText("二面").length).toBeGreaterThan(0);
  });

  it("keeps the score column out of the other interview flows", () => {
    renderTable([makeCandidate()]);

    expect(screen.queryByText("分数")).not.toBeInTheDocument();
    expect(screen.queryByText("面试时段")).not.toBeInTheDocument();
  });

  const roundOneEvaluation = {
    id: 21,
    score: 88,
    content: "一面的面评内容",
    recommendation: null,
    status: "submitted",
    authorId: 2,
    authorName: "甲部长",
    round: 1,
    isMine: true,
  };

  const roundTwoEvaluations = [
    {
      id: 31,
      score: 80,
      content: "乙部长的二面评价",
      recommendation: null,
      status: "submitted",
      authorId: 3,
      authorName: "乙部长",
      round: 2,
      isMine: false,
    },
    {
      id: 32,
      score: 90,
      content: "丙部长的二面评价",
      recommendation: null,
      status: "submitted",
      authorId: 4,
      authorName: "丙部长",
      round: 2,
      isMine: false,
    },
  ];

  it("shows one final score and the slot in the first-round office view", async () => {
    const user = userEvent.setup();
    renderTable(
      [
        makeCandidate({
          userFlowId: 1,
          name: "一面同学",
          round: 1,
          interviewSlot: "10:00-11:00",
          averageScore: 88,
          evaluationCount: 1,
          evaluations: [roundOneEvaluation],
        }),
        makeCandidate({
          userFlowId: 2,
          name: "二面同学",
          studentId: "B002",
          round: 2,
          averageScore: 85,
          evaluationCount: 2,
          evaluations: roundTwoEvaluations,
        }),
      ],
      { scoringEnabled: true, roundView: 1 },
    );

    /* 一面的分数就是那位部长的最终分，时段仍然可改 */
    expect(
      screen.getByRole("columnheader", { name: "最终分" }),
    ).toBeInTheDocument();
    expect(screen.getByText("面试时段")).toBeInTheDocument();
    expect(screen.getAllByText("10:00-11:00").length).toBeGreaterThan(0);
    expect(screen.getAllByText("88").length).toBeGreaterThan(0);
    /* 一位部长只有一个数字，(1) 这种份数标注是噪音 */
    expect(screen.queryByText("(1)")).not.toBeInTheDocument();

    /* 轮次过滤：一面视图不出现二面候选人 */
    expect(screen.queryByText("二面同学")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^全部 \d+$/ })).toHaveTextContent(
      "1",
    );

    await user.click(
      screen.getAllByRole("button", { name: "查看一面同学一面的全部面评" })[0],
    );

    expect(await screen.findByText("一面面评 · 1 份")).toBeInTheDocument();
    expect(screen.getByText("一面的面评内容")).toBeInTheDocument();
  });

  it("shows only the second-round average without a slot column in the second-round view", async () => {
    const user = userEvent.setup();
    renderTable(
      [
        makeCandidate({
          userFlowId: 1,
          name: "一面同学",
          round: 1,
          interviewSlot: "10:00-11:00",
          averageScore: 88,
          evaluationCount: 1,
          evaluations: [roundOneEvaluation],
        }),
        makeCandidate({
          userFlowId: 2,
          name: "二面同学",
          studentId: "B002",
          round: 2,
          interviewSlot: "10:00-11:00",
          averageScore: 85,
          evaluationCount: 2,
          evaluations: roundTwoEvaluations,
        }),
      ],
      { scoringEnabled: true, roundView: 2 },
    );

    expect(
      screen.getByRole("columnheader", { name: "平均分" }),
    ).toBeInTheDocument();
    /* 二面不再展示时段：那一轮是部长评分，时段在一面就定完了 */
    expect(screen.queryByText("面试时段")).not.toBeInTheDocument();
    expect(screen.queryByText("10:00-11:00")).not.toBeInTheDocument();
    expect(screen.getAllByText("85").length).toBeGreaterThan(0);
    expect(screen.getAllByText("2 位部长").length).toBeGreaterThan(0);
    /* 轮次过滤：二面视图不出现一面候选人 */
    expect(screen.queryByText("一面同学")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^全部 \d+$/ })).toHaveTextContent(
      "1",
    );

    await user.click(
      screen.getAllByRole("button", { name: "查看二面同学二面的全部面评" })[0],
    );

    expect(await screen.findByText("二面面评 · 2 位部长")).toBeInTheDocument();
    /* 每位部长的分数与内容都在，但一面那份记录不混进二面弹窗 */
    expect(screen.getByText("乙部长的二面评价")).toBeInTheDocument();
    expect(screen.getByText("丙部长的二面评价")).toBeInTheDocument();
    expect(screen.queryByText("一面的面评内容")).not.toBeInTheDocument();
  });

  it("asks for the remaining reviewers while the second round is under-scored", () => {
    renderTable(
      [
        makeCandidate({
          userFlowId: 1,
          name: "一位部长评分",
          round: 2,
          averageScore: 80,
          evaluationCount: 1,
          evaluations: [roundTwoEvaluations[0]],
        }),
        makeCandidate({
          userFlowId: 2,
          name: "还没有人评分",
          studentId: "B002",
          round: 2,
          averageScore: null,
          evaluationCount: 0,
          evaluations: [],
        }),
      ],
      { scoringEnabled: true, roundView: 2 },
    );

    /* 桌面行与移动端卡片都要提示还差人：半份均分不是最终结果 */
    expect(
      screen.getAllByText("待 2-3 位部长评分").length,
    ).toBeGreaterThanOrEqual(4);
    expect(screen.getAllByText("80").length).toBeGreaterThan(0);
  });

  it("names the round in the empty state and keeps the first-round column set", () => {
    const { unmount } = renderTable(
      [
        makeCandidate({
          userFlowId: 2,
          name: "二面同学",
          round: 2,
          averageScore: 85,
          evaluationCount: 2,
          evaluations: roundTwoEvaluations,
        }),
      ],
      { scoringEnabled: true, roundView: 1 },
    );

    expect(screen.getAllByText("暂无待面试的候选人").length).toBeGreaterThan(0);
    unmount();

    renderTable(
      [
        makeCandidate({
          userFlowId: 1,
          name: "一面同学",
          round: 1,
          interviewSlot: "10:00-11:00",
          averageScore: 88,
          evaluationCount: 1,
          evaluations: [roundOneEvaluation],
        }),
      ],
      { scoringEnabled: true, roundView: 2 },
    );

    expect(screen.getAllByText("暂无进入二面的候选人").length).toBeGreaterThan(0);
    expect(screen.queryByText("面试时段")).not.toBeInTheDocument();
  });

  it("opens the whole record from an office row menu only when the caller wires it", async () => {
    const user = userEvent.setup();
    const onOpenRecord = jest.fn();
    const { unmount } = renderTable(
      [
        makeCandidate({
          userFlowId: 9,
          name: "办公同学",
          round: 1,
          interviewSlot: "10:00-11:00",
          evaluationCount: 0,
          evaluations: [],
        }),
      ],
      { scoringEnabled: true, roundView: 1, onOpenRecord },
    );

    await user.click(screen.getAllByRole("button", { name: "查看全部记录" })[0]);

    expect(onOpenRecord).toHaveBeenCalledWith(9);
    unmount();

    /* 调用方没接弹窗时不渲染这个入口（技术流程同理） */
    const withoutDialog = renderTable(
      [
        makeCandidate({
          userFlowId: 9,
          name: "办公同学",
          round: 1,
          interviewSlot: "10:00-11:00",
          evaluationCount: 0,
          evaluations: [],
        }),
      ],
      { scoringEnabled: true, roundView: 1 },
    );

    expect(
      screen.queryByRole("button", { name: "查看全部记录" }),
    ).not.toBeInTheDocument();
    withoutDialog.unmount();

    renderTable([makeScheduledCandidate({ userFlowId: 8, name: "技术同学" })], {
      onOpenRecord,
    });

    expect(
      screen.queryByRole("button", { name: "查看全部记录" }),
    ).not.toBeInTheDocument();
  });

  it("reads office rows as 待记录 / 已记录 instead of any approval state", () => {
    renderTable(
      [
        makeCandidate({ userFlowId: 3, name: "办公同学" }),
        makeCandidate({
          userFlowId: 4,
          name: "已记录同学",
          studentId: "B002",
          evaluationCount: 2,
        }),
      ],
      { scoringEnabled: true },
    );

    expect(screen.getAllByText("待记录").length).toBeGreaterThan(0);
    expect(screen.getAllByText("已记录 2 份").length).toBeGreaterThan(0);
    expect(screen.queryByText("待预约")).not.toBeInTheDocument();
    // 办公类没有面评审批：行上不出现终审/退回重写这类状态
    expect(screen.queryByText("待终审")).not.toBeInTheDocument();
    expect(screen.queryByText("退回重写")).not.toBeInTheDocument();
  });

  it("labels office row actions as 填写面试记录 / 修改记录", () => {
    renderTable(
      [
        makeCandidate({ userFlowId: 1, name: "无记录同学" }),
        makeCandidate({
          userFlowId: 2,
          name: "本人已记录同学",
          studentId: "B002",
          evaluationCount: 1,
          evaluations: [
            {
              id: 12,
              score: 70,
              content: "本人记录",
              recommendation: null,
              status: "submitted",
              authorId: 9,
              authorName: "本部长",
              isMine: true,
            },
          ],
        }),
        makeCandidate({
          userFlowId: 3,
          name: "他人已记录同学",
          studentId: "B003",
          evaluationCount: 1,
          evaluations: [
            {
              id: 13,
              score: 60,
              content: "他人记录",
              recommendation: null,
              status: "submitted",
              authorId: 8,
              authorName: "其他部长",
              isMine: false,
            },
          ],
        }),
      ],
      { scoringEnabled: true },
    );

    const menus = screen.getAllByTestId("row-menu");
    expect(
      within(menus[0]).getByRole("button", { name: "填写面试记录" }),
    ).toBeInTheDocument();
    expect(
      within(menus[1]).getByRole("button", { name: "修改记录" }),
    ).toBeInTheDocument();
    // 别人的记录只改变行状态（已记录 1 份），本人仍然是从零写一份
    expect(within(menus[2]).getByRole("button", { name: "填写面试记录" })).toBeInTheDocument();
    expect(screen.getAllByText("已记录 1 份").length).toBeGreaterThan(0);
    // 办公类没有面评审批：行菜单里没有退回这一项
    expect(screen.queryByRole("button", { name: "退回" })).not.toBeInTheDocument();
  });

  it("sorts office candidates by interview slot and keeps unassigned ones last", async () => {
    const user = userEvent.setup();
    renderTable(
      [
        makeCandidate({
          userFlowId: 1,
          name: "未选时段同学",
          studentId: "B001",
          interviewSlot: null,
        }),
        makeCandidate({
          userFlowId: 2,
          name: "第二场同学",
          studentId: "B002",
          interviewSlot: "14:00-15:00",
        }),
        makeCandidate({
          userFlowId: 3,
          name: "第一场同学",
          studentId: "B003",
          interviewSlot: "13:00-14:00",
        }),
      ],
      { scoringEnabled: true, slotOptions: ["13:00-14:00", "14:00-15:00"] },
    );

    /* 默认就按「面试时段」升序：按流程配置的时段顺序，没选时段的固定沉底 */
    const names = () =>
      Array.from(document.querySelectorAll("table tbody tr")).map(
        (row) => row.textContent ?? "",
      );
    expect(names()[0]).toContain("第一场同学");
    expect(names()[1]).toContain("第二场同学");
    expect(names()[2]).toContain("未选时段同学");

    await user.click(screen.getAllByRole("button", { name: "面试时段" })[0]);
    /* 降序也保持「未选时段」在最后，不会因为反向而浮到最前 */
    expect(names()[0]).toContain("第二场同学");
    expect(names()[1]).toContain("第一场同学");
    expect(names()[2]).toContain("未选时段同学");
  });

  it("sorts office candidates by average score, highest first", async () => {
    const user = userEvent.setup();
    renderTable(
      [
        makeCandidate({
          userFlowId: 1,
          name: "低分同学",
          studentId: "B002",
          averageScore: 60,
          evaluationCount: 1,
        }),
        makeCandidate({
          userFlowId: 2,
          name: "高分同学",
          studentId: "B001",
          averageScore: 95,
          evaluationCount: 1,
        }),
      ],
      { scoringEnabled: true },
    );

    await user.click(screen.getAllByRole("button", { name: "分数" })[0]);

    const rows = Array.from(document.querySelectorAll("table tbody tr"));
    expect(rows[0].textContent).toContain("高分同学");
    expect(rows[1].textContent).toContain("低分同学");
  });

  it("shows the candidate's choice and sibling department instead of the portfolio column in office flows", () => {
    renderTable(
      [
        makeCandidate({
          userFlowId: 1,
          name: "办公同学",
          choice: 1,
          siblingDepartment: "software",
        }),
        makeCandidate({
          userFlowId: 2,
          name: "第二志愿同学",
          studentId: "B002",
          choice: 2,
          siblingDepartment: null,
        }),
      ],
      { scoringEnabled: true },
    );

    // 办公类流程一条流程只招本部门：列口径是「志愿 + 另一志愿部门」，且不展示作品。
    expect(screen.getAllByText("志愿").length).toBeGreaterThan(0);
    expect(screen.getAllByText("另一志愿部门").length).toBeGreaterThan(0);
    expect(screen.getAllByText("第一志愿").length).toBeGreaterThan(0);
    expect(screen.getAllByText("第二志愿").length).toBeGreaterThan(0);
    expect(screen.queryByText("投递组别")).not.toBeInTheDocument();
    expect(screen.queryByText("第一志愿部门")).not.toBeInTheDocument();
    expect(screen.queryByText("第二志愿部门")).not.toBeInTheDocument();
    expect(screen.queryByText("作品")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "查看作品" }),
    ).not.toBeInTheDocument();
    // 另一志愿部门按展示名渲染（software → 软件研发部），空值标注未填写。
    expect(screen.getAllByText("软件研发部").length).toBeGreaterThan(0);
    expect(screen.getAllByText("未填写").length).toBeGreaterThan(0);
  });

  it("has no editable apply group in office flows", () => {
    renderTable([makeCandidate({ userFlowId: 1, name: "办公同学", choice: 1 })], {
      scoringEnabled: true,
      groupOptions: ["办公室"],
    });

    expect(screen.queryByText("投递组别")).not.toBeInTheDocument();
    expect(
      screen.queryAllByRole("button", { name: /投递组别/ }),
    ).toHaveLength(0);
    expect(mockUpdateCandidateApplyGroup).not.toHaveBeenCalled();
  });

  it("filters office candidates by choice", async () => {
    const user = userEvent.setup();
    renderTable(
      [
        makeCandidate({ userFlowId: 1, name: "第一志愿同学", choice: 1 }),
        makeCandidate({
          userFlowId: 2,
          name: "第二志愿同学",
          studentId: "B002",
          choice: 2,
        }),
      ],
      { scoringEnabled: true },
    );

    expect(screen.getAllByText("全部志愿").length).toBeGreaterThan(0);
    expect(screen.queryByText("全部组别")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "第二志愿" }));

    expect(
      screen.queryAllByRole("button", { name: "第一志愿同学" }),
    ).toHaveLength(0);
    expect(
      screen.getAllByRole("button", { name: "第二志愿同学" }).length,
    ).toBeGreaterThan(0);
  });

  const OFFICE_SLOT_OPTIONS = ["13:00-14:00", "14:00-15:00"];

  const openSlotFilter = () =>
    within(screen.getByLabelText("按面试时段筛选候选人").parentElement as HTMLElement);

  it("lets a manager change the interview slot inline", async () => {
    const user = userEvent.setup();
    mockUpdateCandidateInterviewSlot
      .mockReset()
      .mockResolvedValue({ success: true, slot: "14:00-15:00" });
    const onRefresh = jest.fn();

    renderTable(
      [
        makeCandidate({
          userFlowId: 7,
          name: "办公同学",
          interviewSlot: "13:00-14:00",
        }),
      ],
      { scoringEnabled: true, slotOptions: OFFICE_SLOT_OPTIONS, onRefresh },
    );

    const trigger = screen.getAllByLabelText("修改办公同学的面试时段")[0];
    expect(trigger).toHaveAttribute("title", "点击可修改面试时段");

    await user.click(
      within(trigger.parentElement as HTMLElement).getByRole("button", {
        name: "14:00-15:00",
      }),
    );

    expect(mockUpdateCandidateInterviewSlot).toHaveBeenCalledWith(7, "14:00-15:00");
    expect(jest.requireMock("sonner").toast.success).toHaveBeenCalledWith(
      "面试时段已改为 14:00-15:00",
    );
    expect(onRefresh).toHaveBeenCalled();
    // 成功后本地行数据立刻更新：下拉按新时段展示，不用等服务端刷新
    expect(screen.getAllByLabelText("修改办公同学的面试时段")[0]).toHaveTextContent(
      "14:00-15:00",
    );
  });

  it("can clear the office interview slot", async () => {
    const user = userEvent.setup();
    mockUpdateCandidateInterviewSlot
      .mockReset()
      .mockResolvedValue({ success: true, slot: null });

    renderTable(
      [
        makeCandidate({
          userFlowId: 7,
          name: "办公同学",
          interviewSlot: "13:00-14:00",
        }),
      ],
      { scoringEnabled: true, slotOptions: OFFICE_SLOT_OPTIONS },
    );

    const trigger = screen.getAllByLabelText("修改办公同学的面试时段")[0];
    await user.click(
      within(trigger.parentElement as HTMLElement).getByRole("button", {
        name: "未选择",
      }),
    );

    expect(mockUpdateCandidateInterviewSlot).toHaveBeenCalledWith(7, null);
    expect(jest.requireMock("sonner").toast.success).toHaveBeenCalledWith(
      "已清除该候选人的面试时段",
    );
    expect(screen.getAllByLabelText("修改办公同学的面试时段")[0]).toHaveTextContent(
      "未选择面谈时段",
    );
  });

  it("rolls the inline slot back when the update fails", async () => {
    const user = userEvent.setup();
    mockUpdateCandidateInterviewSlot.mockReset().mockResolvedValue({
      success: false,
      error: { message: "该时段不在当前流程的时段选项内，请刷新后重试" },
    });
    const mockToastError = jest.requireMock("sonner").toast.error as jest.Mock;
    mockToastError.mockReset();

    renderTable(
      [
        makeCandidate({
          userFlowId: 7,
          name: "办公同学",
          interviewSlot: "13:00-14:00",
        }),
      ],
      { scoringEnabled: true, slotOptions: OFFICE_SLOT_OPTIONS },
    );

    const trigger = screen.getAllByLabelText("修改办公同学的面试时段")[0];
    await user.click(
      within(trigger.parentElement as HTMLElement).getByRole("button", {
        name: "14:00-15:00",
      }),
    );

    expect(mockToastError).toHaveBeenCalledWith(
      "该时段不在当前流程的时段选项内，请刷新后重试",
    );
    // 失败回滚到改前的时段
    expect(screen.getAllByLabelText("修改办公同学的面试时段")[0]).toHaveTextContent(
      "13:00-14:00",
    );
  });

  it("keeps the office slot read-only without options or below manager role", () => {
    const { unmount } = renderTable(
      [
        makeCandidate({
          userFlowId: 7,
          name: "办公同学",
          interviewSlot: "13:00-14:00",
        }),
      ],
      { scoringEnabled: true, role: 2, slotOptions: OFFICE_SLOT_OPTIONS },
    );

    expect(screen.queryByLabelText("修改办公同学的面试时段")).not.toBeInTheDocument();
    expect(screen.getAllByText("13:00-14:00").length).toBeGreaterThan(0);
    unmount();

    // 流程没配置时段选项时同样是只读展示
    renderTable(
      [
        makeCandidate({
          userFlowId: 8,
          name: "无选项同学",
          interviewSlot: "13:00-14:00",
        }),
      ],
      { scoringEnabled: true, slotOptions: [] },
    );
    expect(screen.queryByLabelText("修改无选项同学的面试时段")).not.toBeInTheDocument();
  });

  it("filters office candidates by interview slot", async () => {
    const user = userEvent.setup();
    renderTable(
      [
        makeCandidate({
          userFlowId: 1,
          name: "早场同学",
          interviewSlot: "13:00-14:00",
        }),
        makeCandidate({
          userFlowId: 2,
          name: "晚场同学",
          studentId: "B002",
          interviewSlot: "14:00-15:00",
        }),
        makeCandidate({ userFlowId: 3, name: "未选同学", studentId: "B003" }),
      ],
      { scoringEnabled: true, slotOptions: OFFICE_SLOT_OPTIONS },
    );

    expect(screen.getAllByText("全部时段").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /^全部 \d/ })).toHaveTextContent("3");

    await user.click(openSlotFilter().getByRole("button", { name: "14:00-15:00" }));
    expect(screen.queryAllByText("早场同学")).toHaveLength(0);
    expect(screen.getAllByText("晚场同学").length).toBeGreaterThan(0);
    // 计数跟着时段筛选收敛
    expect(screen.getByRole("button", { name: /^全部 \d/ })).toHaveTextContent("1");

    await user.click(openSlotFilter().getByRole("button", { name: "未选择" }));
    expect(screen.getAllByText("未选同学").length).toBeGreaterThan(0);
    expect(screen.queryAllByText("晚场同学")).toHaveLength(0);

    // 时段筛选参与「清除筛选」：空结果时能一键回到全部
    await user.type(screen.getByLabelText("搜索面试候选人"), "不存在的人");
    await user.click(screen.getAllByRole("button", { name: "清除筛选" })[0]);
    expect(screen.getAllByText("早场同学").length).toBeGreaterThan(0);
  });

  it("resets the slot filter when switching to a flow with different slots", async () => {
    const user = userEvent.setup();
    const { rerender } = renderTable(
      [
        makeCandidate({
          userFlowId: 1,
          name: "旧流程同学",
          interviewSlot: "13:00-14:00",
        }),
      ],
      { scoringEnabled: true, slotOptions: OFFICE_SLOT_OPTIONS },
    );

    await user.click(
      openSlotFilter().getByRole("button", { name: "13:00-14:00" }),
    );
    expect(screen.getAllByText("旧流程同学").length).toBeGreaterThan(0);

    /* 切到另一个办公部门流程：时段 label 完全换了 */
    rerender(
      <EvaluationTable
        flowId={1}
        role={3}
        groupOptions={[]}
        onRefresh={jest.fn()}
        scoringEnabled
        slotOptions={["16:00-17:00"]}
        candidates={[
          makeCandidate({
            userFlowId: 2,
            name: "新流程同学",
            studentId: "B002",
            interviewSlot: "16:00-17:00",
          }),
        ]}
      />,
    );

    /* 旧时段的筛选不能继续生效：否则列表静默为空，工具栏还写着「全部时段」 */
    expect(
      screen.queryAllByText("没有符合条件的候选人。"),
    ).toHaveLength(0);
    expect(screen.getAllByText("新流程同学").length).toBeGreaterThan(0);
  });

  it("submits the chosen office opinion alongside the score", async () => {
    const user = userEvent.setup();
    const evaluationActionMock = jest.requireMock(
      "@/action/user-flow/evaluation",
    ) as { createEvaluation: jest.Mock };
    const mockCreateEvaluation = evaluationActionMock.createEvaluation;
    mockCreateEvaluation
      .mockReset()
      .mockResolvedValue({ success: true, data: { id: 12 } });

    renderTable([makeCandidate({ userFlowId: 1, name: "办公同学" })], {
      scoringEnabled: true,
    });

    const rowMenu = within(screen.getAllByTestId("row-menu")[0]);
    await user.click(rowMenu.getByRole("button", { name: "填写面试记录" }));

    await user.type(screen.getByLabelText(/面试记录内容/), "整体表现不错。");
    await user.type(screen.getByLabelText(/面试分数/), "85");
    await user.click(screen.getByRole("button", { name: "建议通过" }));
    await user.click(screen.getByRole("button", { name: "保存记录" }));

    await waitFor(() =>
      expect(mockCreateEvaluation).toHaveBeenCalledWith(
        1,
        "整体表现不错。",
        "passed",
        undefined,
        85,
      ),
    );
  }, 15000);

  it("saves the office record with Ctrl+Enter", async () => {
    const user = userEvent.setup();
    const evaluationActionMock = jest.requireMock(
      "@/action/user-flow/evaluation",
    ) as { createEvaluation: jest.Mock };
    const mockCreateEvaluation = evaluationActionMock.createEvaluation;
    mockCreateEvaluation
      .mockReset()
      .mockResolvedValue({ success: true, data: { id: 13 } });

    renderTable([makeCandidate({ userFlowId: 1, name: "办公同学" })], {
      scoringEnabled: true,
    });

    const rowMenu = within(screen.getAllByTestId("row-menu")[0]);
    await user.click(rowMenu.getByRole("button", { name: "填写面试记录" }));

    await user.type(screen.getByLabelText(/面试记录内容/), "表达清晰，记录完整。");
    await user.type(screen.getByLabelText(/面试分数/), "90");
    /* 长记录不用再去点按钮：Ctrl/⌘ + Enter 直接保存 */
    await user.keyboard("{Control>}{Enter}{/Control}");

    await waitFor(() =>
      expect(mockCreateEvaluation).toHaveBeenCalledWith(
        1,
        "表达清晰，记录完整。",
        null,
        undefined,
        90,
      ),
    );
  }, 15000);

  it("ignores repeated Ctrl+Enter while the first submit is still in flight", async () => {
    const user = userEvent.setup();
    const evaluationActionMock = jest.requireMock(
      "@/action/user-flow/evaluation",
    ) as { createEvaluation: jest.Mock };
    const mockCreateEvaluation = evaluationActionMock.createEvaluation;
    const mockToastSuccess = jest.requireMock("sonner").toast.success as jest.Mock;
    mockToastSuccess.mockReset();
    const pendingSubmit = Promise.withResolvers<unknown>();
    mockCreateEvaluation.mockReset().mockImplementation(() => pendingSubmit.promise);

    renderTable([makeCandidate({ userFlowId: 1, name: "办公同学" })], {
      scoringEnabled: true,
    });

    const rowMenu = within(screen.getAllByTestId("row-menu")[0]);
    await user.click(rowMenu.getByRole("button", { name: "填写面试记录" }));
    await user.type(screen.getByLabelText(/面试记录内容/), "表达清晰，记录完整。");
    await user.type(screen.getByLabelText(/面试分数/), "90");

    /* 按钮与快捷键共用提交锁：第一次还在路上时连按不会再发一次 */
    await user.keyboard("{Control>}{Enter}{/Control}");
    await user.keyboard("{Control>}{Enter}{/Control}");

    expect(mockCreateEvaluation).toHaveBeenCalledTimes(1);

    pendingSubmit.resolve({ success: true, data: { id: 15 } });
    await waitFor(() =>
      expect(mockToastSuccess).toHaveBeenCalledWith("面试记录已保存"),
    );
    expect(mockCreateEvaluation).toHaveBeenCalledTimes(1);
  }, 15000);

  it("shows a saved office opinion in the score popover", async () => {
    const user = userEvent.setup();
    renderTable(
      [
        makeCandidate({
          userFlowId: 1,
          name: "甲同学",
          averageScore: 60,
          evaluationCount: 1,
          evaluations: [
            {
              id: 11,
              score: 60,
              content: "还需要再观察。",
              recommendation: "failed",
              status: "submitted",
              authorId: 2,
              authorName: "甲部长",
              round: 1,
              isMine: true,
            },
          ],
        }),
      ],
      { scoringEnabled: true },
    );

    await user.click(
      screen.getAllByRole("button", { name: "查看甲同学当前阶段的全部面评" })[0],
    );

    expect(await screen.findByText("意见：建议不通过")).toBeInTheDocument();
  });

  it("keeps the portfolio column in the technical interview flows", () => {
    renderTable([
      makeCandidate({
        userFlowId: 1,
        portfolioLink: "https://example.com/portfolio",
      }),
    ]);

    expect(screen.getAllByText("投递组别").length).toBeGreaterThan(0);
    expect(screen.getAllByText("作品").length).toBeGreaterThan(0);
    expect(screen.queryByText("志愿")).not.toBeInTheDocument();
    expect(screen.queryByText("另一志愿部门")).not.toBeInTheDocument();
  });

  it("keeps the office record dialog to content, score and an optional opinion", async () => {
    const user = userEvent.setup();
    renderTable([makeCandidate({ userFlowId: 1, name: "办公同学" })], {
      scoringEnabled: true,
    });

    const rowMenu = within(screen.getAllByTestId("row-menu")[0]);
    await user.click(rowMenu.getByRole("button", { name: "填写面试记录" }));

    // 办公类弹窗标题与提交按钮
    expect(screen.getByRole("dialog")).toHaveTextContent("填写面试记录");
    expect(screen.getByRole("button", { name: "保存记录" })).toBeInTheDocument();
    // 字段：记录内容 + 分数 + 可选的面试意见
    expect(screen.getByLabelText(/面试记录内容/)).toBeInTheDocument();
    expect(screen.getByLabelText(/面试分数/)).toBeInTheDocument();
    /* 上限、可选说明与快捷键提示都贴在标题行：必填规则不再重复成整段说明 */
    expect(screen.getByText("0-100 整数")).toBeInTheDocument();
    expect(screen.getByText("可选，不影响结果")).toBeInTheDocument();
    expect(screen.getByText("Ctrl/⌘ + Enter 提交")).toBeInTheDocument();
    expect(screen.getByLabelText("面试意见（参考）")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "不填" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "建议通过" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "建议不通过" })).toBeInTheDocument();
    // 意见是下拉参考项，不是技术流程那组必填的讲师建议
    expect(screen.queryByRole("group", { name: /讲师建议/ })).not.toBeInTheDocument();
    expect(screen.queryByText("妙记链接")).not.toBeInTheDocument();
    expect(screen.queryByText("作品链接")).not.toBeInTheDocument();
  });

  it("keeps the lecturer wording in the technical interview flows", async () => {
    const user = userEvent.setup();
    renderTable([
      makeEndedCandidate({ userFlowId: 1, name: "技术同学" }),
    ]);

    const rowMenu = within(screen.getAllByTestId("row-menu")[0]);
    await user.click(rowMenu.getByRole("button", { name: "填写面评" }));

    expect(screen.getByRole("group", { name: "讲师建议" })).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "部长建议" })).not.toBeInTheDocument();
  });

  it("clears the filters when the round view or the flow changes", async () => {
    const user = userEvent.setup();
    const candidates = [
      makeCandidate({ userFlowId: 1, name: "甲同学", round: 1 }),
      makeCandidate({ userFlowId: 2, name: "乙同学", round: 2 }),
    ];
    const table = (flowId: number, roundView: 1 | 2) => (
      <EvaluationTable
        flowId={flowId}
        role={3}
        groupOptions={[]}
        onRefresh={jest.fn()}
        candidates={candidates}
        scoringEnabled
        roundView={roundView}
      />
    );
    const { rerender } = render(table(1, 1));

    await user.click(screen.getByRole("button", { name: /待记录/ }));
    expect(screen.getByRole("button", { name: /待记录/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    /* 切轮次是一次「重新开始看」：上一屏的胶囊不该继续筛新列表 */
    rerender(table(1, 2));
    expect(screen.getByRole("button", { name: /待记录/ })).toHaveAttribute(
      "aria-pressed",
      "false",
    );

    await user.click(screen.getByRole("button", { name: /待记录/ }));
    expect(screen.getByRole("button", { name: /待记录/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    /* 切流程同理 */
    rerender(table(2, 2));
    expect(screen.getByRole("button", { name: /待记录/ })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });
});
