import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RecruitmentContent } from "@/components/recruitment/recruitmentContent";
import { calScore } from "@/action/user-flow/user-point/calScore";

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
  EvaluationTable: () => null,
}));

jest.mock("@/components/recruitment/columns", () => ({ columns: [] }));
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
});
