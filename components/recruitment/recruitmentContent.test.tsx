import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RecruitmentContent } from "@/components/recruitment/recruitmentContent";
import { calScore } from "@/action/user-flow/user-point/calScore";
import { getEvaluationCandidates } from "@/action/user-flow/evaluation";
import { closeOfficeRoundOne } from "@/action/user-flow/office-rounds";

const mockToastSuccess = jest.fn();
const mockToastError = jest.fn();
const mockToastWarning = jest.fn();

jest.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => mockToastSuccess(...args),
    error: (...args: unknown[]) => mockToastError(...args),
    warning: (...args: unknown[]) => mockToastWarning(...args),
  },
}));

jest.mock("@/action/user-flow/office-rounds", () => ({
  closeOfficeRoundOne: jest.fn(),
}));

jest.mock("@/action/user-flow/user-point/calScore", () => ({
  calScore: jest.fn(),
}));

jest.mock("@/action/user-flow/evaluation", () => ({
  getEvaluationCandidates: jest.fn(),
}));

jest.mock("@/action/user-flow/interview-slot-change", () => ({
  /* 工作台测试不关心待审批面板；挂起 Promise 避免渲染后异步 setState */
  listPendingSlotChangeRequests: jest.fn(() => new Promise(() => {})),
}));

jest.mock("@/components/recruitment/selectFlow", () => ({
  SelectFlow: ({
    onChange,
    flowTypes,
    defaultFlowTypeId,
  }: {
    onChange?: (value: string) => void;
    flowTypes?: Array<{ id: number }>;
    defaultFlowTypeId?: string;
  }) => (
    <div
      data-testid="select-flow"
      data-flows={(flowTypes ?? []).map((flow) => flow.id).join(",")}
      data-value={defaultFlowTypeId ?? ""}
    >
      <button onClick={() => onChange?.("1")}>Flow 1</button>
      <button onClick={() => onChange?.("2")}>Flow 2</button>
    </div>
  ),
}));

jest.mock("@/components/recruitment/table", () => ({
  DataTable: ({ data }: { data: Array<{ totalScore: string }> }) => (
    <div data-testid="scores">{data.map((item) => item.totalScore).join(",")}</div>
  ),
}));

jest.mock("@/components/recruitment/evaluationTable", () => ({
  EvaluationTable: ({
    loading,
    slotOptions,
    roundView,
    onOpenRecord,
  }: {
    loading?: boolean;
    slotOptions?: string[];
    roundView?: 1 | 2 | null;
    onOpenRecord?: (userFlowId: number) => void;
  }) => (
    <div
      data-testid="evaluation-table"
      data-loading={String(Boolean(loading))}
      data-slot-options={(slotOptions ?? []).join(",")}
      data-round-view={roundView === null || roundView === undefined ? "null" : String(roundView)}
    >
      {onOpenRecord && (
        <button onClick={() => onOpenRecord(7)}>打开全部记录</button>
      )}
    </div>
  ),
}));

jest.mock("@/components/recruitment/pendingSlotChangePanel", () => ({
  PendingSlotChangePanel: ({ rows }: { rows: unknown[] }) => (
    <div data-testid="pending-slot-panel" data-count={rows.length} />
  ),
}));

jest.mock("@/components/recruitment/ResultPublicationPanel", () => ({
  ResultPublicationPanel: () => <div data-testid="publication-panel" />,
}));

jest.mock("@/components/recruitment/officeRecordDialog", () => ({
  OfficeRecordDialog: ({
    open,
    userFlowId,
    onOpenChange,
  }: {
    open: boolean;
    userFlowId: number | null;
    onOpenChange: (open: boolean) => void;
  }) =>
    open ? (
      <div data-testid="record-dialog" data-user-flow-id={String(userFlowId)}>
        <button onClick={() => onOpenChange(false)}>关闭记录</button>
      </div>
    ) : null,
}));

jest.mock("@/components/recruitment/columns", () => ({
  makeColumns: () => [],
}));
jest.mock("@/components/loading", () => ({ Loading: () => <div>Loading</div> }));

const mockCalScore = jest.mocked(calScore);

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
};

describe("RecruitmentContent", () => {
  it("keeps the latest flow result when requests complete out of order", async () => {
    const first = deferred<Awaited<ReturnType<typeof calScore>>>();
    const second = deferred<Awaited<ReturnType<typeof calScore>>>();
    mockCalScore.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const user = userEvent.setup();

    render(
      <RecruitmentContent
        flowTypes={[]}
        initialData={[]}
        initialEvalData={[]}
        defaultFlowId="1"
        mode="written"
        role={3}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Flow 1" }));
    await user.click(screen.getByRole("button", { name: "Flow 2" }));

    await act(async () => {
      second.resolve([{ totalScore: "92" }] as Awaited<ReturnType<typeof calScore>>);
    });
    await act(async () => {
      first.resolve([{ totalScore: "75" }] as Awaited<ReturnType<typeof calScore>>);
    });

    expect(screen.getByTestId("scores")).toHaveTextContent("92");
  });

  it("remembers the flow the user switches to for the next visit", async () => {
    const user = userEvent.setup();
    jest.mocked(getEvaluationCandidates).mockResolvedValueOnce([]);
    document.cookie = "people_workspace_flow_interview=; path=/; max-age=0";

    render(
      <RecruitmentContent
        flowTypes={[]}
        initialData={[]}
        initialEvalData={[]}
        defaultFlowId="1"
        mode="interview"
        role={3}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Flow 2" }));

    /* 记录「最后一次点选的流程」：下次打开面试管理，服务端按该 Cookie 直接选中 */
    expect(document.cookie).toContain("people_workspace_flow_interview=2");
  });

  it("reports a failed flow load instead of rendering it as an empty list", async () => {
    const user = userEvent.setup();
    jest
      .mocked(getEvaluationCandidates)
      .mockRejectedValueOnce(new Error("backend unavailable"));
    jest
      .mocked(getEvaluationCandidates)
      .mockResolvedValueOnce([
        { userFlowId: 1, name: "张三", uid: 1 },
      ] as Awaited<ReturnType<typeof getEvaluationCandidates>>);

    render(
      <RecruitmentContent
        flowTypes={[]}
        initialData={[]}
        initialEvalData={[]}
        defaultFlowId="1"
        mode="interview"
        role={3}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Flow 1" }));

    expect(await screen.findByText("列表加载失败")).toBeInTheDocument();
    // The table must not be mounted at all, so its empty copy cannot be mistaken
    // for "this flow has no candidates".
    expect(screen.queryByTestId("evaluation-table")).not.toBeInTheDocument();

    // Retrying re-runs the load for the same flow and recovers.
    await user.click(screen.getByRole("button", { name: "重试" }));

    expect(await screen.findByTestId("evaluation-table")).toBeInTheDocument();
    expect(screen.queryByText("列表加载失败")).not.toBeInTheDocument();
  });

  it("passes the loading state down so the table keeps its toolbar mounted", async () => {
    const user = userEvent.setup();
    const pending = deferred<
      Awaited<ReturnType<typeof getEvaluationCandidates>>
    >();
    jest.mocked(getEvaluationCandidates).mockReturnValueOnce(pending.promise);

    render(
      <RecruitmentContent
        flowTypes={[]}
        initialData={[]}
        initialEvalData={[]}
        defaultFlowId="1"
        mode="interview"
        role={3}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Flow 1" }));

    expect(screen.getByTestId("evaluation-table")).toHaveAttribute(
      "data-loading",
      "true",
    );

    await act(async () => {
      pending.resolve([]);
    });

    expect(screen.getByTestId("evaluation-table")).toHaveAttribute(
      "data-loading",
      "false",
    );
  });

  const officeFlowTypes = [
    {
      id: 1,
      title: "办公类部门面试招新",
      type: "office_interview",
      groupOptions: ["办公室"],
      slotOptions: [{ label: "13:00-14:00" }, { label: "14:00-15:00" }],
    },
  ] as never;

  /* 技术部门面试流程：改期审批面板只对它展示 */
  const technicalFlowTypes = [
    {
      id: 5,
      title: "软件研发部WOC招新",
      type: "woc",
      groupOptions: ["开发组"],
      slotOptions: null,
    },
  ] as never;

  /* 混合流程：页签要按「部门 × 阶段」的语义口径分组，且只列出实际有流程的组合 */
  const combinedFlowTypes = [
    { id: 1, title: "办公室面试 2026", type: "office_interview", department: "office", groupOptions: [], slotOptions: [] },
    { id: 2, title: "办公室面试 2025", type: "office_interview", department: "office", groupOptions: [], slotOptions: [] },
    { id: 10, title: "软件研发部免试 2026", type: "recruitment_exemption", department: "software", groupOptions: [], slotOptions: null },
    { id: 11, title: "多媒体部WOD 2026", type: "woc", department: "media", groupOptions: [], slotOptions: null },
  ] as never;

  /* 一面名单只取「一面进行中」的候选人；其余轮次/状态的候选人不进名单 */
  const roundOneCandidates = [
    {
      userFlowId: 1,
      name: "张三",
      studentId: "2021001",
      choice: 1,
      siblingDepartment: null,
      status: "ongoing",
      round: 1,
      evaluations: [
        { round: 1, score: 88, status: "submitted" },
        { round: 2, score: 60, status: "submitted" },
      ],
    },
    {
      userFlowId: 2,
      name: "李四",
      studentId: "2021002",
      choice: 2,
      siblingDepartment: "多媒体部",
      status: "ongoing",
      round: 1,
      evaluations: [],
    },
    {
      userFlowId: 3,
      name: "王五",
      studentId: "2021003",
      choice: null,
      siblingDepartment: null,
      status: "ongoing",
      round: 2,
      evaluations: [{ round: 2, score: 70, status: "submitted" }],
    },
    {
      userFlowId: 4,
      name: "赵六",
      studentId: "2021004",
      choice: 1,
      siblingDepartment: null,
      status: "failed",
      round: 1,
      evaluations: [],
    },
  ] as never;

  it("confirms the round-one roster and reports the confirmed counts", async () => {
    const user = userEvent.setup();
    jest.mocked(getEvaluationCandidates).mockResolvedValue([] as never);
    jest.mocked(closeOfficeRoundOne).mockResolvedValue({
      success: true,
      passCount: 1,
      rejectCount: 1,
      sent: 2,
    });

    render(
      <RecruitmentContent
        flowTypes={officeFlowTypes}
        initialData={[]}
        initialEvalData={roundOneCandidates}
        defaultFlowId="1"
        mode="interview"
        role={3}
      />,
    );

    await user.click(screen.getByRole("button", { name: "结束一面并发送通知" }));

    // 名单只列一面候选人，且展示一面记录的均分（二面分数不计入）。
    // 弹窗同时渲染桌面表格与移动端卡片，所以每个名字命中两处。
    expect(screen.getAllByText("张三")).toHaveLength(2);
    expect(screen.getAllByText("李四")).toHaveLength(2);
    expect(screen.queryByText("王五")).not.toBeInTheDocument();
    expect(screen.queryByText("赵六")).not.toBeInTheDocument();
    expect(screen.getAllByText("88").length).toBeGreaterThan(0);

    // 默认全部通过；把李四改为不通过后再确认
    await user.click(screen.getAllByRole("button", { name: "李四 不通过" })[0]);
    await user.click(screen.getByRole("checkbox", { name: "确认邮件模板" }));
    await user.click(screen.getByRole("button", { name: /确认名单并发送/ }));

    await waitFor(() =>
      expect(closeOfficeRoundOne).toHaveBeenCalledWith(
        1,
        [
          { userFlowId: 1, passed: true },
          { userFlowId: 2, passed: false },
        ],
        [1, 2],
        true,
      ),
    );
    expect(mockToastSuccess).toHaveBeenCalledWith(
      "一面名单已确认：通过 1 人 · 未通过 1 人",
    );
    expect(mockToastWarning).not.toHaveBeenCalled();
    // 确认后关闭弹窗并重新拉取候选人
    await waitFor(() =>
      expect(screen.queryByText("张三")).not.toBeInTheDocument(),
    );
    expect(getEvaluationCandidates).toHaveBeenCalledWith(1);
  });

  it("lets the round-one roster skip notifications for unchecked candidates", async () => {
    const user = userEvent.setup();
    jest.mocked(closeOfficeRoundOne).mockResolvedValue({
      success: true,
      passCount: 2,
      rejectCount: 0,
      sent: 1,
    });

    render(
      <RecruitmentContent
        flowTypes={officeFlowTypes}
        initialData={[]}
        initialEvalData={roundOneCandidates}
        defaultFlowId="1"
        mode="interview"
        role={3}
      />,
    );

    await user.click(screen.getByRole("button", { name: "结束一面并发送通知" }));

    /* 取消李四的「邮件」勾选：只写结果、不发通知（桌面表格与移动端卡片各一份，点第一个） */
    await user.click(
      screen.getAllByRole("checkbox", { name: "向 李四 发送一面结果通知" })[0],
    );
    expect(screen.getByText("1 人本次不发邮件")).toBeInTheDocument();

    await user.click(screen.getByRole("checkbox", { name: "确认邮件模板" }));
    await user.click(screen.getByRole("button", { name: /确认名单并发送/ }));

    await waitFor(() =>
      expect(closeOfficeRoundOne).toHaveBeenCalledWith(
        1,
        [
          { userFlowId: 1, passed: true },
          { userFlowId: 2, passed: true },
        ],
        [1],
        true,
      ),
    );
  });

  it("swaps 结束一面 for the roster review once the round-one results exist", async () => {
    const user = userEvent.setup();
    render(
      <RecruitmentContent
        flowTypes={officeFlowTypes}
        initialData={[]}
        initialEvalData={
          [
            {
              userFlowId: 3,
              name: "王五",
              status: "ongoing",
              round: 2,
              evaluations: [{ round: 1, score: 70 }],
            },
          ] as never
        }
        defaultFlowId="1"
        mode="interview"
        role={3}
      />,
    );

    /* 只剩二面候选人时默认落在二面：一面那一轮的入口不该出现 */
    expect(screen.getByRole("button", { name: "二面 1" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(
      screen.queryByRole("button", { name: "结束一面并发送通知" }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "一面 0" }));

    /* 一/二面切换只影响视图：不重新拉取候选人 */
    expect(getEvaluationCandidates).not.toHaveBeenCalled();
    expect(screen.getByTestId("evaluation-table")).toHaveAttribute(
      "data-round-view",
      "1",
    );
    /* 一面已确认（有人进入二面）：结束一面的动作消失，改为查看 / 导出名单 */
    expect(
      screen.queryByRole("button", { name: "结束一面并发送通知" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "导出一面名单" }),
    ).toHaveAttribute("href", "/api/flow/office-round-one-export?flowId=1");

    await user.click(screen.getByRole("button", { name: "查看一面名单" }));

    /* 回看的是确认结论：进入二面 = 一面通过 */
    const rosterDialog = await screen.findByRole("dialog");
    expect(rosterDialog).toHaveTextContent("王五");
    expect(rosterDialog).toHaveTextContent("通过");
  });

  it("stays on the first-round view when nobody has reached the second round", () => {
    jest.mocked(getEvaluationCandidates).mockResolvedValue([] as never);
    jest.mocked(closeOfficeRoundOne).mockResolvedValue({
      success: true,
      passCount: 0,
      rejectCount: 0,
      sent: 1,
      emailWarning: "没有需要发送的一面结果通知（可能已全部发送过）",
    });

    render(
      <RecruitmentContent
        flowTypes={officeFlowTypes}
        initialData={[]}
        initialEvalData={
          [
            /* 一面已出结果的人（不通过）不在待确认名单里，但视图仍是一面 */
            { userFlowId: 4, status: "failed", round: 1, evaluations: [] },
          ] as never
        }
        defaultFlowId="1"
        mode="interview"
        role={3}
      />,
    );

    expect(screen.getByRole("button", { name: "一面 1" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    /* 一面已全部出结果：收口按钮消失，改为名单回看与导出（补发通知在邮件中心处理） */
    expect(
      screen.queryByRole("button", { name: "结束一面并发送通知" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "查看一面名单" }),
    ).toBeEnabled();
  });

  it("re-derives the round view when another flow is loaded", async () => {
    const user = userEvent.setup();
    const officeFlows = [
      { id: 1, title: "办公室面试 2026", type: "office_interview", department: "office", groupOptions: [], slotOptions: [] },
      { id: 2, title: "办公室面试 2025", type: "office_interview", department: "office", groupOptions: [], slotOptions: [] },
    ] as never;
    /* 另一条流程只剩二面候选人：视图要跟着数据落到二面 */
    jest.mocked(getEvaluationCandidates).mockResolvedValue([
      { userFlowId: 3, status: "ongoing", round: 2, evaluations: [] },
    ] as never);

    render(
      <RecruitmentContent
        flowTypes={officeFlows}
        initialData={[]}
        initialEvalData={
          [
            { userFlowId: 1, status: "ongoing", round: 1, evaluations: [] },
          ] as never
        }
        defaultFlowId="1"
        mode="interview"
        role={3}
      />,
    );

    expect(screen.getByRole("button", { name: "一面 1" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    await user.click(screen.getByRole("button", { name: "Flow 2" }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "二面 1" })).toHaveAttribute(
        "aria-pressed",
        "true",
      ),
    );
    expect(screen.getByRole("tab", { name: "办公室面试" })).toHaveAttribute(
      "data-state",
      "active",
    );
  });

  it("renders a tab per department-and-stage combination in semantic order", () => {
    render(
      <RecruitmentContent
        flowTypes={combinedFlowTypes}
        initialData={[]}
        initialEvalData={[]}
        defaultFlowId="11"
        mode="interview"
        role={3}
      />,
    );

    /* 页签只列实际存在流程的组合，顺序按「部门 × 阶段」的语义口径 */
    expect(
      screen.getAllByRole("tab").map((tab) => tab.textContent),
    ).toEqual(["软件研发部免试", "多媒体部WOD", "办公室面试"]);
    /* 默认页签 = 当前流程所在组合，流程选择器只给该组合下的流程 */
    expect(screen.getByRole("tab", { name: "多媒体部WOD" })).toHaveAttribute(
      "data-state",
      "active",
    );
    expect(screen.getByTestId("select-flow")).toHaveAttribute("data-flows", "11");
    expect(screen.getByTestId("select-flow")).toHaveAttribute("data-value", "11");
  });

  it("loads the newest flow of the tab's combination when a tab is clicked", async () => {
    const user = userEvent.setup();
    jest.mocked(getEvaluationCandidates).mockResolvedValue([] as never);

    render(
      <RecruitmentContent
        flowTypes={combinedFlowTypes}
        initialData={[]}
        initialEvalData={[]}
        defaultFlowId="11"
        mode="interview"
        role={3}
      />,
    );

    await user.click(screen.getByRole("tab", { name: "办公室面试" }));

    /* 组合下的流程按服务端顺序（createdAt 倒序），首条即最新 */
    await waitFor(() =>
      expect(getEvaluationCandidates).toHaveBeenCalledWith(1),
    );
    expect(screen.getByTestId("select-flow")).toHaveAttribute("data-flows", "1,2");
    expect(screen.getByTestId("select-flow")).toHaveAttribute("data-value", "1");
  });

  it("keeps the tabs out of the flow-less workspace", () => {
    render(
      <RecruitmentContent
        flowTypes={[]}
        initialData={[]}
        initialEvalData={[]}
        mode="interview"
        role={3}
      />,
    );

    /* 一条流程都没有：不渲染页签，保持「暂无流程」空状态 */
    expect(screen.queryAllByRole("tab")).toHaveLength(0);
    expect(screen.getByText("暂无流程")).toBeInTheDocument();
  });

  it("renders the result publication panel in the second round only", async () => {
    const user = userEvent.setup();
    render(
      <RecruitmentContent
        flowTypes={officeFlowTypes}
        initialData={[]}
        initialEvalData={
          [
            { userFlowId: 1, status: "ongoing", round: 1, evaluations: [] },
          ] as never
        }
        defaultFlowId="1"
        mode="interview"
        role={3}
      />,
    );

    /* 一面还在收人：结果发布按钮放出来只会被误点 */
    expect(screen.queryByTestId("publication-panel")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "二面 0" }));

    expect(screen.getByTestId("publication-panel")).toBeInTheDocument();
  });

  it("opens the archive dialog for the candidate the table reports", async () => {
    const user = userEvent.setup();
    render(
      <RecruitmentContent
        flowTypes={officeFlowTypes}
        initialData={[]}
        initialEvalData={[]}
        defaultFlowId="1"
        mode="interview"
        role={3}
      />,
    );

    expect(screen.queryByTestId("record-dialog")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "打开全部记录" }));

    expect(screen.getByTestId("record-dialog")).toHaveAttribute(
      "data-user-flow-id",
      "7",
    );

    await user.click(screen.getByRole("button", { name: "关闭记录" }));

    expect(screen.queryByTestId("record-dialog")).not.toBeInTheDocument();
  });

  it("confirms the roster with the candidate list in the first-round view", async () => {
    const user = userEvent.setup();
    /* 确认后重新拉取：通过的人已经在二面名单里 */
    jest.mocked(getEvaluationCandidates).mockResolvedValue([
      { userFlowId: 1, name: "张三", status: "ongoing", round: 2, evaluations: [] },
    ] as never);
    jest.mocked(closeOfficeRoundOne).mockResolvedValue({
      success: true,
      passCount: 2,
      rejectCount: 0,
      sent: 1,
    });

    render(
      <RecruitmentContent
        flowTypes={officeFlowTypes}
        initialData={[]}
        initialEvalData={roundOneCandidates}
        defaultFlowId="1"
        mode="interview"
        role={3}
      />,
    );

    await user.click(screen.getByRole("button", { name: "结束一面并发送通知" }));
    await user.click(screen.getByRole("checkbox", { name: "确认邮件模板" }));
    await user.click(screen.getByRole("button", { name: /确认名单并发送/ }));

    await waitFor(() =>
      expect(mockToastSuccess).toHaveBeenCalledWith(
        "一面名单已确认：通过 2 人 · 未通过 0 人",
      ),
    );

    /* 有人通过说明名单已经推进：视图自动切到二面，一面收口按钮随之消失 */
    expect(screen.getByRole("button", { name: "二面 1" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByTestId("evaluation-table")).toHaveAttribute(
      "data-round-view",
      "2",
    );
    expect(
      screen.queryByRole("button", { name: "结束一面并发送通知" }),
    ).not.toBeInTheDocument();
  });

  it("keeps the roster open when the confirmation is rejected", async () => {
    const user = userEvent.setup();
    jest.mocked(closeOfficeRoundOne).mockResolvedValue({
      success: false,
      error: { message: "名单已变化，请刷新后重新确认" },
    });

    render(
      <RecruitmentContent
        flowTypes={officeFlowTypes}
        initialData={[]}
        initialEvalData={roundOneCandidates}
        defaultFlowId="1"
        mode="interview"
        role={3}
      />,
    );

    await user.click(screen.getByRole("button", { name: "结束一面并发送通知" }));
    await user.click(screen.getByRole("checkbox", { name: "确认邮件模板" }));
    await user.click(screen.getByRole("button", { name: /确认名单并发送/ }));

    await waitFor(() =>
      expect(mockToastError).toHaveBeenCalledWith("名单已变化，请刷新后重新确认"),
    );
    expect(mockToastSuccess).not.toHaveBeenCalled();
    expect(screen.getAllByText("张三").length).toBeGreaterThan(0);
  });

  it("passes the office slot options to the table and hides the slot change panel", () => {
    render(
      <RecruitmentContent
        flowTypes={officeFlowTypes}
        initialData={[]}
        initialEvalData={[]}
        defaultFlowId="1"
        mode="interview"
        role={3}
      />,
    );

    /* 办公类由部长在工作台内直接改时段：时段选项要传给面评表 */
    expect(screen.getByTestId("evaluation-table")).toHaveAttribute(
      "data-slot-options",
      "13:00-14:00,14:00-15:00",
    );
    /* 改期审批已从办公类下线 */
    expect(screen.queryByTestId("pending-slot-panel")).not.toBeInTheDocument();
  });

  it("keeps the slot change panel for the technical interview flows", async () => {
    render(
      <RecruitmentContent
        flowTypes={technicalFlowTypes}
        initialData={[]}
        initialEvalData={[]}
        defaultFlowId="5"
        mode="interview"
        role={3}
      />,
    );

    expect(await screen.findByTestId("pending-slot-panel")).toBeInTheDocument();
    expect(screen.getByTestId("evaluation-table")).toHaveAttribute(
      "data-slot-options",
      "",
    );
  });

  it("keeps the round-one roster away from non-managers and non-office flows", () => {
    const { unmount } = render(
      <RecruitmentContent
        flowTypes={officeFlowTypes}
        initialData={[]}
        initialEvalData={[]}
        defaultFlowId="1"
        mode="interview"
        role={2}
      />,
    );

    expect(
      screen.queryByRole("button", { name: "结束一面并发送通知" }),
    ).not.toBeInTheDocument();
    unmount();

    render(
      <RecruitmentContent
        flowTypes={[]}
        initialData={[]}
        initialEvalData={[]}
        defaultFlowId="1"
        mode="interview"
        role={3}
      />,
    );

    expect(
      screen.queryByRole("button", { name: "结束一面并发送通知" }),
    ).not.toBeInTheDocument();
  });
});
