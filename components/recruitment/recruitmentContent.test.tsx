import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RecruitmentContent } from "@/components/recruitment/recruitmentContent";
import { calScore } from "@/action/user-flow/user-point/calScore";
import { getEvaluationCandidates } from "@/action/user-flow/evaluation";

jest.mock("@/action/user-flow/user-point/calScore", () => ({
  calScore: jest.fn(),
}));

jest.mock("@/action/user-flow/evaluation", () => ({
  getEvaluationCandidates: jest.fn(),
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
});
