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
  SelectFlow: ({ onChange }: { onChange?: (value: string) => void }) => (
    <>
      <button onClick={() => onChange?.("1")}>Flow 1</button>
      <button onClick={() => onChange?.("2")}>Flow 2</button>
    </>
  ),
}));

jest.mock("@/components/recruitment/table", () => ({
  DataTable: ({ data }: { data: Array<{ totalScore: string }> }) => (
    <div data-testid="scores">{data.map((item) => item.totalScore).join(",")}</div>
  ),
}));

jest.mock("@/components/recruitment/evaluationTable", () => ({
  EvaluationTable: ({ loading }: { loading?: boolean }) => (
    <div data-testid="evaluation-table" data-loading={String(Boolean(loading))} />
  ),
}));

jest.mock("@/components/recruitment/ResultPublicationPanel", () => ({
  ResultPublicationPanel: () => null,
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
    },
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

  it("confirms an empty roster so unsent notifications can be re-sent", async () => {
    const user = userEvent.setup();
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
            { userFlowId: 3, status: "ongoing", round: 2, evaluations: [] },
          ] as never
        }
        defaultFlowId="1"
        mode="interview"
        role={3}
      />,
    );

    await user.click(screen.getByRole("button", { name: "结束一面并发送通知" }));

    expect(screen.getByText("没有需要确认的候选人。")).toBeInTheDocument();
    await user.click(screen.getByRole("checkbox", { name: "确认邮件模板" }));
    const confirmButton = screen.getByRole("button", { name: /确认名单并发送/ });
    expect(confirmButton).toBeEnabled();
    await user.click(confirmButton);

    await waitFor(() => expect(closeOfficeRoundOne).toHaveBeenCalledWith(1, [], true));
    expect(mockToastSuccess).toHaveBeenCalledWith(
      "一面名单已确认：通过 0 人 · 未通过 0 人",
    );
    expect(mockToastWarning).toHaveBeenCalledWith(
      "没有需要发送的一面结果通知（可能已全部发送过）",
    );
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
