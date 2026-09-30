import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RecruitmentContent } from "@/components/recruitment/recruitmentContent";
import { calScore } from "@/action/user-flow/user-point/calScore";
import { getEvaluationCandidates } from "@/action/user-flow/evaluation";
import { sendOfficeRoundOneEmails } from "@/action/email/office-round-one";

const mockToastSuccess = jest.fn();
const mockToastError = jest.fn();

jest.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => mockToastSuccess(...args),
    error: (...args: unknown[]) => mockToastError(...args),
  },
}));

jest.mock("@/action/email/office-round-one", () => ({
  sendOfficeRoundOneEmails: jest.fn(),
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

  it("sends the office round-one emails after confirmation", async () => {
    const user = userEvent.setup();
    jest
      .mocked(sendOfficeRoundOneEmails)
      .mockResolvedValue({ success: true, sent: 2, passCount: 1, rejectCount: 1 });

    render(
      <RecruitmentContent
        flowTypes={officeFlowTypes}
        initialData={[]}
        initialEvalData={
          [
            { userFlowId: 1, status: "ongoing", round: 2 },
            { userFlowId: 2, status: "failed", round: 1 },
          ] as never
        }
        defaultFlowId="1"
        mode="interview"
        role={3}
      />,
    );

    await user.click(screen.getByRole("button", { name: "发送一面结果通知（通过 1 人 · 未通过 1 人）" }));
    await user.click(screen.getByRole("button", { name: "确认发送" }));

    await waitFor(() =>
      expect(sendOfficeRoundOneEmails).toHaveBeenCalledWith(1),
    );
    expect(mockToastSuccess).toHaveBeenCalledWith(
      "已发送一面结果通知：通过 1 人 · 未通过 1 人",
    );
  });

  it("surfaces a failed office round-one send without claiming success", async () => {
    const user = userEvent.setup();
    jest.mocked(sendOfficeRoundOneEmails).mockResolvedValue({
      success: false,
      error: { message: "暂无可发送的一面结果通知" },
    } as never);

    render(
      <RecruitmentContent
        flowTypes={officeFlowTypes}
        initialData={[]}
        initialEvalData={
          [
            { userFlowId: 1, status: "ongoing", round: 2 },
            { userFlowId: 2, status: "failed", round: 1 },
          ] as never
        }
        defaultFlowId="1"
        mode="interview"
        role={3}
      />,
    );

    await user.click(screen.getByRole("button", { name: "发送一面结果通知（通过 1 人 · 未通过 1 人）" }));
    await user.click(screen.getByRole("button", { name: "确认发送" }));

    await waitFor(() =>
      expect(mockToastError).toHaveBeenCalledWith(
        "暂无可发送的一面结果通知",
      ),
    );
    expect(mockToastSuccess).not.toHaveBeenCalled();
  });

  it("keeps the office round-one email away from non-managers and non-office flows", () => {
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
      screen.queryByRole("button", { name: "发送一面通过通知" }),
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
      screen.queryByRole("button", { name: "发送一面通过通知" }),
    ).not.toBeInTheDocument();
  });
});
